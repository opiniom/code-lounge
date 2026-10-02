from typing import List
import asyncio
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from database import get_db
from models import User, Project, ProjectMember, ChatMessage, CalendarEvent, ProjectFile, MeetingDoc
from schemas import ProjectCreate, ProjectResponse, MemberBrief, InviteRequest
from services.auth_service import get_current_user
from services.access import member_project_ids, get_member_project, project_users

router = APIRouter(prefix="/api/projects", tags=["Projects"])

async def _to_response(db: AsyncSession, project: Project, user: User) -> ProjectResponse:
    users = await project_users(db, project)
    return ProjectResponse(
        id=project.id, title=project.title, created_at=project.created_at,
        is_owner=(project.owner_id == user.id),
        members=[MemberBrief(id=u.id, username=u.username) for u in users],
    )

@router.get("", response_model=List[ProjectResponse])
async def list_projects(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """내가 만들었거나 멤버로 초대된 프로젝트 목록 (최신순)"""
    ids = await member_project_ids(db, current_user)
    if not ids:
        return []
    projects = (await db.execute(select(Project).where(Project.id.in_(ids)).order_by(Project.id.desc()))).scalars().all()
    return [await _to_response(db, p, current_user) for p in projects]

_create_locks = {}

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    title = data.title.strip()
    # 사용자별로 생성 요청을 한 줄로 세운다. 한글 입력에서 같은 Enter 가 1~2ms 간격으로 두 번 들어오면
    # 두 요청이 동시에 "최근 프로젝트"를 조회해서 둘 다 통과하던 문제를 막는다.
    lock = _create_locks.setdefault(current_user.id, asyncio.Lock())
    async with lock:
        # "밍키" 직후 "키"처럼, 5초 안에 만든 프로젝트와 같은 이름이거나 그 이름의 앞/뒤 일부이면 새로 만들지 않고 기존 프로젝트를 돌려준다.
        recent = (await db.execute(
            select(Project).where(Project.owner_id == current_user.id).order_by(Project.id.desc()).limit(1)
        )).scalar_one_or_none()
        if recent is not None and datetime.utcnow() - recent.created_at < timedelta(seconds=5):
            prev = recent.title
            if prev == title or (len(title) < len(prev) and (prev.endswith(title) or prev.startswith(title))):
                return await _to_response(db, recent, current_user)
            # 순서가 뒤바뀌어 짧은 조각("키")이 먼저 만들어지고 온전한 이름("밍키")이 나중에 온 경우: 조각을 온전한 이름으로 바꾼다
            if len(prev) < len(title) and (title.endswith(prev) or title.startswith(prev)):
                recent.title = title
                await db.commit()
                await db.refresh(recent)
                return await _to_response(db, recent, current_user)

        project = Project(owner_id=current_user.id, title=title)
        db.add(project)
        await db.commit()
        await db.refresh(project)
        return await _to_response(db, project, current_user)

@router.post("/{project_id}/members", response_model=ProjectResponse)
async def invite_member(
    project_id: int,
    data: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """이메일로 팀원 초대. 상대가 이미 한 번 로그인(가입)한 계정이어야 한다."""
    project = await get_member_project(db, project_id, current_user)
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="프로젝트 소유자만 팀원을 초대할 수 있어요.")
    target = (await db.execute(
        select(User).where(func.lower(User.email) == str(data.email).lower())
    )).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="해당 이메일로 가입한 사용자가 없어요. 상대가 한 번 로그인한 뒤 초대할 수 있어요.")
    already = target.id == project.owner_id or (await db.execute(
        select(ProjectMember.id).where(ProjectMember.project_id == project.id, ProjectMember.user_id == target.id)
    )).scalar_one_or_none() is not None
    if already:
        raise HTTPException(status_code=400, detail="이미 이 프로젝트의 팀원이에요.")
    db.add(ProjectMember(project_id=project.id, user_id=target.id, role="member"))
    await db.commit()
    return await _to_response(db, project, current_user)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """프로젝트 삭제 (소유자만). 프로젝트의 채팅·일정·파일·멤버가 함께 삭제되고, 회의록은 '프로젝트 없음'으로 남는다."""
    project = await get_member_project(db, project_id, current_user)
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="프로젝트 소유자만 삭제할 수 있어요.")
    await db.execute(delete(ChatMessage).where(ChatMessage.project_id == project_id))
    await db.execute(delete(CalendarEvent).where(CalendarEvent.project_id == project_id))
    await db.execute(delete(ProjectFile).where(ProjectFile.project_id == project_id))
    await db.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))
    await db.execute(update(MeetingDoc).where(MeetingDoc.project_id == project_id).values(project_id=None))
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()
