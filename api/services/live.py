"""실시간 푸시 (WebSocket /ws/live).

예전에는 화면이 채팅 3초, 알림 20초, 팀원 상태 30초마다 서버에 "바뀐 거 있어?" 하고 물어봤다(폴링).
이제는 서버가 바뀌는 순간 해당 사용자 화면으로 바로 알려준다:
  · notification  새 알림           · chat      프로젝트 채팅에 새 글/변경
  · calendar      일정 추가·수정·삭제 · notes     회의록 추가·수정·삭제
  · projects      프로젝트/팀원 변화   · presence  팀원의 온라인·자리비움·방해금지·오프라인
DB 에 커밋된 뒤에만 보내므로(SQLAlchemy 이벤트), 라우터 코드를 일일이 고치지 않아도 모든 저장 경로가 포함된다.
연결이 끊기면 화면은 예전처럼 폴링으로 돌아간다.
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Iterable, Optional, Set

from fastapi import WebSocket
from sqlalchemy import event, or_, select
from sqlalchemy.orm import Session

logger = logging.getLogger("live")
OFFLINE_GRACE = 4.0          # 새로고침처럼 잠깐 끊겼다 다시 붙는 경우를 오프라인으로 치지 않는 시간(초)


class LiveHub:
    def __init__(self) -> None:
        self.conns: Dict[int, Set[WebSocket]] = {}
        self._grace: Dict[int, asyncio.Task] = {}

    def is_online(self, user_id: int) -> bool:
        return bool(self.conns.get(user_id))

    async def connect(self, user_id: int, ws: WebSocket) -> bool:
        """연결을 등록한다. 돌려주는 값: 이 연결로 '새로 온라인'이 되었는지"""
        await ws.accept()
        was_online = self.is_online(user_id)
        self.conns.setdefault(user_id, set()).add(ws)
        t = self._grace.pop(user_id, None)
        if t:
            t.cancel()
        return not was_online

    def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """연결 해제. 돌려주는 값: 이 사용자의 마지막 연결이었는지"""
        s = self.conns.get(user_id)
        if s:
            s.discard(ws)
            if not s:
                self.conns.pop(user_id, None)
                return True
        return False

    async def send(self, user_ids: Iterable[int], payload: dict) -> None:
        for uid in set(user_ids):
            for ws in list(self.conns.get(uid, ())):
                try:
                    await ws.send_json(payload)
                except Exception:
                    self.conns.get(uid, set()).discard(ws)

    def schedule_offline(self, user_id: int) -> None:
        old = self._grace.pop(user_id, None)
        if old:
            old.cancel()
        self._grace[user_id] = asyncio.get_running_loop().create_task(self._offline_later(user_id))

    async def _offline_later(self, user_id: int) -> None:
        try:
            await asyncio.sleep(OFFLINE_GRACE)
        except asyncio.CancelledError:
            return
        self._grace.pop(user_id, None)
        if self.is_online(user_id):
            return
        from database import async_session_maker
        from models import User
        async with async_session_maker() as db:
            u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if u:
                u.last_seen_at = None
                await db.commit()
            await publish_presence(db, user_id, "offline")


hub = LiveHub()


# ---------- 대상(누구에게 보낼지) ----------
async def teammate_ids(db, user_id: int) -> Set[int]:
    """같은 프로젝트에 있는 사람들(나 포함)"""
    from models import Project, ProjectMember
    mine = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    owned = select(Project.id).where(Project.owner_id == user_id)
    pids = select(Project.id).where(or_(Project.id.in_(mine), Project.id.in_(owned))).scalar_subquery()
    members = (await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id.in_(select(Project.id).where(or_(Project.id.in_(mine), Project.id.in_(owned))))))).scalars().all()
    owners = (await db.execute(select(Project.owner_id).where(or_(Project.id.in_(mine), Project.id.in_(owned))))).scalars().all()
    return set(members) | set(owners) | {user_id}


async def project_audience(db, project_id: int) -> Set[int]:
    from models import Project, ProjectMember
    members = (await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id))).scalars().all()
    owner = (await db.execute(select(Project.owner_id).where(Project.id == project_id))).scalar_one_or_none()
    return set(members) | ({owner} if owner else set())


async def publish_presence(db, user_id: int, status: Optional[str] = None) -> None:
    from models import User
    from routers.presence import effective_status
    if status is None:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not u:
            return
        status = effective_status(u.presence_pref, datetime.utcnow() if hub.is_online(user_id) else u.last_seen_at)
    await hub.send(await teammate_ids(db, user_id), {"t": "presence", "user_id": user_id, "status": status})


# ---------- 커밋 후 푸시 (SQLAlchemy 이벤트) ----------
def _collect(session: Session, flush_context=None) -> None:
    from models import CalendarEvent, ChatMessage, MeetingDoc, Notification, Project, ProjectMember
    bag = session.info.setdefault("live", set())
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        if isinstance(obj, Notification):
            bag.add(("notification", obj.user_id, None))
        elif isinstance(obj, ChatMessage):
            bag.add(("chat", None, obj.project_id))
        elif isinstance(obj, CalendarEvent):
            bag.add(("calendar", None, obj.project_id))
        elif isinstance(obj, MeetingDoc):
            if obj.project_id:
                bag.add(("notes", None, obj.project_id))
        elif isinstance(obj, ProjectMember):
            bag.add(("projects", obj.user_id, obj.project_id))
        elif isinstance(obj, Project):
            bag.add(("projects", None, obj.id))


def _publish(session: Session) -> None:
    bag = session.info.pop("live", None)
    if not bag:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_deliver(set(bag)))


def _clear(session: Session, *args) -> None:
    session.info.pop("live", None)


async def _deliver(bag: set) -> None:
    from database import async_session_maker
    try:
        async with async_session_maker() as db:
            for kind, user_id, project_id in bag:
                targets: Set[int] = set()
                if user_id:
                    targets.add(user_id)
                if project_id:
                    targets |= await project_audience(db, project_id)
                payload = {"t": kind}
                if project_id:
                    payload["project_id"] = project_id
                await hub.send(targets, payload)
    except Exception:
        logger.exception("live deliver failed")


def install() -> None:
    event.listen(Session, "after_flush", _collect)
    event.listen(Session, "after_commit", _publish)
    event.listen(Session, "after_rollback", _clear)
