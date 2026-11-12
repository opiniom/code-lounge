"""워크스페이스 코드 줄 메모 API.

- 프로젝트 팀원이면 누구나 읽고, 새로 달고, '해결' 표시를 바꿀 수 있다.
- 글 고치기·지우기는 쓴 사람이나 프로젝트 소유자만.
- 담당 팀원(assignee)을 정하면 그 팀원에게 '파일·줄 위치가 달린' 알림이 간다 (누르면 그 줄이 열린다).
- 메모는 줄 번호 + 그 줄의 글자(anchor)를 같이 저장한다. 코드가 고쳐져 줄이 밀려도 화면이 anchor 로 같은 줄을 다시 찾는다.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CodeMemo, Notification, Project, ProjectFile, User
from services.access import get_member_project, project_users
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/memos", tags=["Workspace Memos"])

MAX_MEMOS = 500
MAX_TEXT = 300


class MemoCreate(BaseModel):
    path: str = Field(..., min_length=1, max_length=300)
    line: int = Field(..., ge=1, le=99999)
    text: str = Field(..., min_length=1, max_length=MAX_TEXT)
    anchor: Optional[str] = Field(None, max_length=200)
    assignee_id: Optional[int] = None


class MemoUpdate(BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=MAX_TEXT)
    resolved: Optional[bool] = None
    assignee_id: Optional[int] = None
    clear_assignee: bool = False
    line: Optional[int] = Field(None, ge=1, le=99999)          # 코드가 고쳐져 줄이 밀렸을 때 화면이 새 위치를 알려 준다
    anchor: Optional[str] = Field(None, max_length=200)


class MemoOut(BaseModel):
    id: int
    path: str
    line: int
    anchor: Optional[str] = None
    text: str
    author_id: Optional[int] = None
    author: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee: Optional[str] = None
    resolved: bool
    resolved_by: Optional[str] = None
    source: str
    created_at: str
    updated_at: str
    can_edit: bool


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


def clean_anchor(s: Optional[str]) -> Optional[str]:
    t = " ".join((s or "").split())[:200]
    return t or None


def clean_path(p: str) -> str:
    import re
    return re.sub(r"/+", "/", (p or "").strip().strip("/"))


async def _names(db: AsyncSession, rows: List[CodeMemo]) -> dict:
    ids = {x for r in rows for x in (r.author_id, r.assignee_id, r.resolved_by) if x}
    if not ids:
        return {}
    return {u.id: u.username for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()}


def to_out(m: CodeMemo, names: dict, viewer: User, project: Project) -> MemoOut:
    return MemoOut(
        id=m.id, path=m.path, line=m.line, anchor=m.anchor, text=m.text, author_id=m.author_id, author=names.get(m.author_id),
        assignee_id=m.assignee_id, assignee=names.get(m.assignee_id), resolved=m.resolved, resolved_by=names.get(m.resolved_by),
        source=m.source, created_at=_iso(m.created_at), updated_at=_iso(m.updated_at),
        can_edit=bool(m.author_id == viewer.id or project.owner_id == viewer.id),
    )


async def notify_assignee(db: AsyncSession, project: Project, author: User, assignee: Optional[User], memo: CodeMemo):
    """담당 팀원에게 알림: 누르면 그 파일의 그 줄이 열린다 (본인에게는 보내지 않는다)"""
    if assignee is None or assignee.id == author.id:
        return
    db.add(Notification(
        user_id=assignee.id, project_id=project.id, category="project", title=f"{author.username}님의 코드 메모 · {memo.path} {memo.line}번 줄",
        message=memo.text[:300], link=f"file:{project.id}:{memo.line}:{memo.path}"[:300],
    ))


async def _assignee(db: AsyncSession, project: Project, assignee_id: Optional[int]) -> Optional[User]:
    if assignee_id is None:
        return None
    u = next((x for x in await project_users(db, project) if x.id == assignee_id), None)
    if u is None:
        raise HTTPException(status_code=400, detail="이 프로젝트의 팀원만 담당자로 정할 수 있어요.")
    return u


@router.get("", response_model=List[MemoOut])
async def list_memos(project_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await get_member_project(db, project_id, current_user)
    rows = (await db.execute(select(CodeMemo).where(CodeMemo.project_id == project_id).order_by(CodeMemo.path, CodeMemo.line, CodeMemo.id))).scalars().all()
    names = await _names(db, rows)
    return [to_out(r, names, current_user, project) for r in rows]


@router.post("", response_model=MemoOut, status_code=status.HTTP_201_CREATED)
async def create_memo(project_id: int, data: MemoCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await get_member_project(db, project_id, current_user)
    path = clean_path(data.path)
    exists = (await db.execute(select(ProjectFile.id).where(ProjectFile.project_id == project_id, ProjectFile.path == path))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="메모를 달 파일을 찾을 수 없어요.")
    count = (await db.execute(select(func.count(CodeMemo.id)).where(CodeMemo.project_id == project_id))).scalar_one()
    if count >= MAX_MEMOS:
        raise HTTPException(status_code=400, detail=f"프로젝트당 메모는 최대 {MAX_MEMOS}개까지 달 수 있어요. 해결한 메모를 지워 주세요.")
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="메모 내용을 적어 주세요.")
    assignee = await _assignee(db, project, data.assignee_id)
    memo = CodeMemo(project_id=project_id, path=path, line=data.line, anchor=clean_anchor(data.anchor), text=text,
                    author_id=current_user.id, assignee_id=assignee.id if assignee else None, source="manual")
    db.add(memo)
    await db.flush()
    await notify_assignee(db, project, current_user, assignee, memo)
    await db.commit()
    await db.refresh(memo)
    return to_out(memo, await _names(db, [memo]), current_user, project)


async def _get(db: AsyncSession, project_id: int, memo_id: int) -> CodeMemo:
    m = (await db.execute(select(CodeMemo).where(CodeMemo.id == memo_id, CodeMemo.project_id == project_id))).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없어요.")
    return m


@router.patch("/{memo_id}", response_model=MemoOut)
async def update_memo(project_id: int, memo_id: int, data: MemoUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await get_member_project(db, project_id, current_user)
    m = await _get(db, project_id, memo_id)
    can_edit = m.author_id == current_user.id or project.owner_id == current_user.id
    if (data.text is not None or data.assignee_id is not None or data.clear_assignee) and not can_edit:
        raise HTTPException(status_code=403, detail="메모를 쓴 사람이나 프로젝트 소유자만 고칠 수 있어요.")
    if data.text is not None:
        t = data.text.strip()
        if not t:
            raise HTTPException(status_code=400, detail="메모 내용을 적어 주세요.")
        m.text = t
    if data.clear_assignee:
        m.assignee_id = None
    elif data.assignee_id is not None and data.assignee_id != m.assignee_id:
        assignee = await _assignee(db, project, data.assignee_id)
        m.assignee_id = assignee.id
        await notify_assignee(db, project, current_user, assignee, m)
    if data.resolved is not None and data.resolved != m.resolved:     # 해결 표시는 팀원 누구나 (고친 사람이 직접 체크할 수 있게)
        m.resolved = data.resolved
        m.resolved_by = current_user.id if data.resolved else None
    if data.line is not None:                                          # 줄 번호 보정(코드 수정으로 줄이 밀림)은 팀원 누구나
        m.line = data.line
        if data.anchor is not None:
            m.anchor = clean_anchor(data.anchor)
    await db.commit()
    await db.refresh(m)
    return to_out(m, await _names(db, [m]), current_user, project)


@router.delete("/{memo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memo(project_id: int, memo_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project = await get_member_project(db, project_id, current_user)
    m = await _get(db, project_id, memo_id)
    if m.author_id != current_user.id and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="메모를 쓴 사람이나 프로젝트 소유자만 지울 수 있어요.")
    await db.delete(m)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
