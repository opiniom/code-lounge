import re
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, Project, ProjectMember, ProjectInvitation, Notification
from schemas import (
    InviteLinkCreate, InviteLinkResponse, InviteInfoResponse, JoinInviteResponse,
    GuestJoinRequest, GuestJoinResponse, UserResponse,
)
from services.auth_service import get_current_user, get_current_user_optional, create_access_token
from services.access import get_member_project

router = APIRouter(tags=["Invitations"])

@router.post("/api/projects/{project_id}/invite-link", response_model=InviteLinkResponse)
async def create_invite_link(
    project_id: int,
    data: Optional[InviteLinkCreate] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """프로젝트 초대 링크(고유 URL 토큰) 생성. 팀장(소유자)만 생성 가능"""
    project = await get_member_project(db, project_id, current_user)
    if project.owner_id != current_user.id:
        # 멤버가 leader인지도 확인
        leader_member = (await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == current_user.id,
                ProjectMember.role == "leader"
            )
        )).scalar_one_or_none()
        if not leader_member:
            raise HTTPException(status_code=403, detail="프로젝트 팀장만 초대 링크를 생성할 수 있습니다.")

    hours = (data.expires_in_hours if data and data.expires_in_hours else 72)
    max_uses = (data.max_uses if data and data.max_uses is not None else 0)
    expires_at = datetime.utcnow() + timedelta(hours=hours)
    token = uuid.uuid4().hex[:16]

    invitation = ProjectInvitation(
        project_id=project.id,
        token=token,
        created_by=current_user.id,
        expires_at=expires_at,
        max_uses=max_uses,
        used_count=0
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    return InviteLinkResponse(
        token=token,
        invite_url=f"/?invite={token}",
        expires_at=invitation.expires_at,
        max_uses=invitation.max_uses,
        used_count=invitation.used_count
    )


@router.get("/api/invitations/{token}", response_model=InviteInfoResponse)
async def get_invite_info(
    token: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """초대 링크 정보 확인"""
    inv = (await db.execute(
        select(ProjectInvitation).where(ProjectInvitation.token == token)
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="유효하지 않거나 존재하지 않는 초대 링크입니다.")

    now = datetime.utcnow()
    is_expired = (inv.expires_at is not None and inv.expires_at < now)
    if inv.max_uses > 0 and inv.used_count >= inv.max_uses:
        is_expired = True

    project = (await db.execute(
        select(Project).where(Project.id == inv.project_id)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="해당 프로젝트를 찾을 수 없습니다.")

    inviter = (await db.execute(
        select(User).where(User.id == inv.created_by)
    )).scalar_one_or_none()
    inviter_name = inviter.username if inviter else "팀원"

    is_already = False
    if current_user:
        if current_user.id == project.owner_id:
            is_already = True
        else:
            member = (await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.user_id == current_user.id
                )
            )).scalar_one_or_none()
            if member:
                is_already = True

    return InviteInfoResponse(
        token=token,
        project_id=project.id,
        project_title=project.title,
        inviter_name=inviter_name,
        is_expired=is_expired,
        is_already_member=is_already
    )


@router.post("/api/invitations/{token}/join", response_model=JoinInviteResponse)
async def join_by_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """초대 링크를 통해 프로젝트에 자동 팀원으로 참여"""
    inv = (await db.execute(
        select(ProjectInvitation).where(ProjectInvitation.token == token)
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="유효하지 않은 초대 링크입니다.")

    now = datetime.utcnow()
    if inv.expires_at and inv.expires_at < now:
        raise HTTPException(status_code=400, detail="초대 링크 유효기간이 만료되었습니다.")
    if inv.max_uses > 0 and inv.used_count >= inv.max_uses:
        raise HTTPException(status_code=400, detail="초대 링크의 최대 사용 횟수를 초과했습니다.")

    project = (await db.execute(
        select(Project).where(Project.id == inv.project_id)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    # 이미 팀원인지 확인
    if current_user.id == project.owner_id:
        return JoinInviteResponse(
            message="이미 프로젝트의 소유자(팀장)입니다.",
            project_id=project.id,
            project_title=project.title
        )

    already = (await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == current_user.id
        )
    )).scalar_one_or_none()

    if already:
        return JoinInviteResponse(
            message="이미 해당 프로젝트의 팀원입니다.",
            project_id=project.id,
            project_title=project.title
        )

    # 신규 팀원으로 가입 처리
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role="member"))
    inv.used_count += 1
    await db.commit()

    return JoinInviteResponse(
        message=f"'{project.title}' 프로젝트에 성공적으로 참여했습니다!",
        project_id=project.id,
        project_title=project.title
    )


# 링크에 사용 횟수 제한(max_uses)이 없을 때, 게스트 참여 상한 (링크가 퍼져도 무한정 늘어나지 않게)
GUEST_JOIN_CAP = 30


def _clean_name(raw: str) -> str:
    name = re.sub(r"[\x00-\x1f\x7f<>]", "", raw or "")
    return re.sub(r"\s+", " ", name).strip()[:20]


@router.post("/api/invitations/{token}/guest-join", response_model=GuestJoinResponse)
async def guest_join_by_invite(
    token: str,
    data: GuestJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """초대 링크를 받은 사람이 별도 가입·로그인 없이 이름만 정해 참여한다 (링크 자체가 초대장 역할).

    - 링크의 유효기간·최대 사용 횟수를 그대로 따른다.
    - 이 브라우저에서만 쓰는 임시 팀원 계정이 만들어진다 (이메일 없음, 비밀번호 없음).
    """
    inv = (await db.execute(
        select(ProjectInvitation).where(ProjectInvitation.token == token)
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="유효하지 않은 초대 링크입니다.")
    now = datetime.utcnow()
    if inv.expires_at and inv.expires_at < now:
        raise HTTPException(status_code=400, detail="초대 링크 유효기간이 만료되었습니다.")
    limit = inv.max_uses if inv.max_uses > 0 else GUEST_JOIN_CAP
    if inv.used_count >= limit:
        raise HTTPException(status_code=400, detail="이 초대 링크로 들어올 수 있는 인원을 넘었어요. 새 링크를 요청해 주세요.")

    name = _clean_name(data.username)
    if not name:
        raise HTTPException(status_code=400, detail="팀에서 쓸 이름을 입력해 주세요.")

    project = (await db.execute(select(Project).where(Project.id == inv.project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    user = User(
        email=f"guest-{secrets.token_hex(8)}@guest.sync.local",
        hashed_password="",
        username=name,
        oauth_provider="invite",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=user.id, role="member"))
    inv.used_count += 1

    # 초대한 사람과 프로젝트 소유자에게 알림
    for uid in {u for u in (inv.created_by, project.owner_id) if u}:
        db.add(Notification(
            user_id=uid, project_id=project.id, title="새 팀원이 참여했어요",
            message=f"{name}님이 초대 링크로 '{project.title}' 프로젝트에 참여했습니다.",
            category="project", link=None,
        ))
    await db.commit()
    await db.refresh(user)

    return GuestJoinResponse(
        access_token=create_access_token(data={"sub": str(user.id), "email": user.email}),
        user=UserResponse.model_validate(user),
        message=f"'{project.title}' 프로젝트에 참여했습니다!",
        project_id=project.id,
        project_title=project.title,
    )
