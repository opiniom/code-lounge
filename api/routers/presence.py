"""접속 상태(온라인 · 자리비움 · 방해금지 · 오프라인).

- 아무 설정도 안 하면(auto) 사이트에 들어와 있는 동안 '온라인', 닫으면 자동으로 '오프라인'.
- 자리비움 / 방해금지는 사용자가 직접 고른다. (접속해 있는 동안만 팀원에게 그 상태로 보인다)
- 브라우저가 30초마다 하트비트를 보내고, 일정 시간 신호가 없으면 오프라인으로 본다. (탭을 그냥 닫거나 네트워크가 끊겨도 정리됨)
- 상태는 같은 프로젝트의 팀원에게만 보인다.
"""
from datetime import datetime, timedelta
from typing import Dict, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Project, ProjectMember, User
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/presence", tags=["Presence"])

STALE_AFTER = timedelta(seconds=120)      # 하트비트(30초)가 이 시간 넘게 없으면 오프라인
PREFS = ("auto", "away", "dnd")


def effective_status(pref: Optional[str], last_seen: Optional[datetime], now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    if last_seen is None or now - last_seen > STALE_AFTER:
        return "offline"
    return pref if pref in ("away", "dnd") else "online"


class HeartbeatBody(BaseModel):
    status: Optional[Literal["auto", "away", "dnd"]] = None     # 사용자가 상태를 바꿨을 때만 보낸다


class PresenceMe(BaseModel):
    pref: str
    status: str


@router.post("/heartbeat", response_model=PresenceMe)
async def heartbeat(body: HeartbeatBody, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """접속 중임을 알린다. status 를 함께 보내면 내 상태를 바꾼다. 항상 서버에 저장된 내 상태를 돌려준다."""
    changed = bool(body.status) and body.status != (current_user.presence_pref or "auto")
    if body.status:
        current_user.presence_pref = body.status
    current_user.last_seen_at = datetime.utcnow()
    await db.commit()
    if changed:   # 상태를 바꾼 순간 팀원 화면에 바로 반영
        from services import live
        await live.publish_presence(db, current_user.id)
    return PresenceMe(pref=current_user.presence_pref or "auto", status=effective_status(current_user.presence_pref, current_user.last_seen_at))


@router.post("/offline", response_model=PresenceMe)
async def go_offline(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """사이트를 닫을 때 호출 → 바로 오프라인으로 표시"""
    current_user.last_seen_at = None
    await db.commit()
    from services import live
    if not live.hub.is_online(current_user.id):
        await live.publish_presence(db, current_user.id, "offline")
    return PresenceMe(pref=current_user.presence_pref or "auto", status="offline")


@router.get("/team", response_model=Dict[str, str])
async def team_presence(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """같은 프로젝트에 있는 팀원들의 상태 { 사용자id: online|away|dnd|offline }"""
    mine = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
    owned = select(Project.id).where(Project.owner_id == current_user.id)
    project_ids = select(Project.id).where(or_(Project.id.in_(mine), Project.id.in_(owned))).subquery()
    member_ids = select(ProjectMember.user_id).where(ProjectMember.project_id.in_(select(project_ids.c.id)))
    owner_ids = select(Project.owner_id).where(Project.id.in_(select(project_ids.c.id)))
    rows = (await db.execute(select(User).where(or_(User.id.in_(member_ids), User.id.in_(owner_ids))))).scalars().all()
    now = datetime.utcnow()
    from services import live
    from models import Follow
    out_ids = set((await db.execute(select(Follow.followee_id).where(Follow.follower_id == current_user.id))).scalars().all())
    in_ids = set((await db.execute(select(Follow.follower_id).where(Follow.followee_id == current_user.id))).scalars().all())
    friends = out_ids & in_ids
    if friends:
        rows = list({u.id: u for u in list(rows) + list((await db.execute(select(User).where(User.id.in_(friends)))).scalars().all())}.values())
    return {str(u.id): effective_status(u.presence_pref, now if live.hub.is_online(u.id) else u.last_seen_at, now) for u in rows}
