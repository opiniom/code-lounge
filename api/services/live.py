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
    from models import Follow, Project, ProjectMember
    mine = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    owned = select(Project.id).where(Project.owner_id == user_id)
    pids = select(Project.id).where(or_(Project.id.in_(mine), Project.id.in_(owned))).scalar_subquery()
    members = (await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id.in_(select(Project.id).where(or_(Project.id.in_(mine), Project.id.in_(owned))))))).scalars().all()
    owners = (await db.execute(select(Project.owner_id).where(or_(Project.id.in_(mine), Project.id.in_(owned))))).scalars().all()
    base = set(members) | set(owners) | {user_id}
    # 서로 팔로우한 사람(친구)에게도 접속 상태가 보인다
    out = set((await db.execute(select(Follow.followee_id).where(Follow.follower_id == user_id))).scalars().all())
    inn = set((await db.execute(select(Follow.follower_id).where(Follow.followee_id == user_id))).scalars().all())
    return base | (out & inn)


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
    from models import CalendarEvent, ChatMessage, Follow, MeetingDoc, Notification, Project, ProjectFile, ProjectMember
    bag = session.info.setdefault("live", set())
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        if isinstance(obj, Notification):
            bag.add(("notification", obj.user_id, None, None))
        elif isinstance(obj, ChatMessage):
            bag.add(("chat", None, obj.project_id, obj.user_id))
        elif isinstance(obj, CalendarEvent):
            bag.add(("calendar", None, obj.project_id, None))
        elif isinstance(obj, Follow):                      # 팔로우/언팔로우: 양쪽 화면의 숫자·목록을 바로 갱신
            bag.add(("follow", obj.followee_id, None, obj.follower_id))
            bag.add(("follow", obj.follower_id, None, obj.followee_id))
        elif isinstance(obj, ProjectFile):
            bag.add(("files", None, obj.project_id, None))
        elif isinstance(obj, MeetingDoc):
            if obj.project_id:
                bag.add(("notes", None, obj.project_id, None))
        elif isinstance(obj, ProjectMember):
            bag.add(("projects", obj.user_id, obj.project_id, None))
        elif isinstance(obj, Project):
            bag.add(("projects", None, obj.id, None))


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
            for kind, user_id, project_id, sender in bag:
                targets: Set[int] = set()
                if user_id:
                    targets.add(user_id)
                if project_id:
                    targets |= await project_audience(db, project_id)
                payload = {"t": kind}
                if project_id:
                    payload["project_id"] = project_id
                if sender:
                    payload["from"] = sender
                await hub.send(targets, payload)
    except Exception:
        logger.exception("live deliver failed")


def install() -> None:
    event.listen(Session, "after_flush", _collect)
    event.listen(Session, "after_commit", _publish)
    event.listen(Session, "after_rollback", _clear)


# ---------- "입력 중…" 표시: 프로젝트 팀원에게만 전달 (저장하지 않는 순간 신호) ----------
_aud_cache: Dict[int, tuple] = {}

async def relay_typing(user, project_id: int, on: bool) -> None:
    import time
    from database import async_session_maker
    hit = _aud_cache.get(project_id)
    if not hit or time.time() - hit[0] > 60:
        async with async_session_maker() as db:
            aud = await project_audience(db, project_id)
        _aud_cache[project_id] = (time.time(), aud)
    else:
        aud = hit[1]
    if user.id not in aud:
        return
    await hub.send(aud - {user.id}, {"t": "typing", "project_id": project_id, "user_id": user.id, "name": user.username, "on": bool(on)})


# ---------- 워크스페이스 '누가 어느 파일을 보는/수정 중인지' (저장하지 않는 순간 상태, 메모리에만 보관) ----------
_ws_state: Dict[int, Dict[int, dict]] = {}     # project_id -> user_id -> {path, editing}
_ws_where: Dict[int, int] = {}                 # user_id -> 지금 워크스페이스를 열어 둔 project_id


async def _audience(project_id: int) -> Set[int]:
    import time
    from database import async_session_maker
    hit = _aud_cache.get(project_id)
    if not hit or time.time() - hit[0] > 60:
        async with async_session_maker() as db:
            aud = await project_audience(db, project_id)
        _aud_cache[project_id] = (time.time(), aud)
        return aud
    return hit[1]


async def _ws_broadcast(user_id: int, name: str, project_id: int, path: Optional[str], editing: bool) -> None:
    aud = await _audience(project_id)
    await hub.send(aud - {user_id}, {"t": "wspres", "project_id": project_id, "user_id": user_id, "name": name, "path": path, "editing": editing})


async def relay_ws_presence(user, project_id: int, path: Optional[str], editing: bool) -> None:
    """클라이언트가 보낸 '지금 이 파일을 보고/수정하는 중' 신호를 프로젝트 팀원에게 전달한다.
    path 가 None 이면 워크스페이스를 떠난 것. 보낸 사람에게는 현재 다른 팀원들의 상태(스냅샷)를 돌려준다."""
    aud = await _audience(project_id)
    if user.id not in aud:
        return
    path = (path or "")[:240] or None
    prev = _ws_where.get(user.id)
    if prev is not None and prev != project_id:                      # 다른 프로젝트로 옮겨 감 → 이전 프로젝트에서는 사라짐
        _ws_state.get(prev, {}).pop(user.id, None)
        await _ws_broadcast(user.id, user.username, prev, None, False)
    if path is None:
        _ws_state.get(project_id, {}).pop(user.id, None)
        _ws_where.pop(user.id, None)
    else:
        _ws_state.setdefault(project_id, {})[user.id] = {"path": path, "editing": bool(editing), "name": user.username}
        _ws_where[user.id] = project_id
    await _ws_broadcast(user.id, user.username, project_id, path, bool(editing) and path is not None)
    items = [{"user_id": uid, "name": v["name"], "path": v["path"], "editing": v["editing"]}
             for uid, v in _ws_state.get(project_id, {}).items() if uid != user.id and uid in aud and hub.is_online(uid)]
    await hub.send({user.id}, {"t": "wssnap", "project_id": project_id, "items": items})


async def clear_ws_presence(user_id: int, name: str = "") -> None:
    """연결이 끊기면 그 사람의 '작업 중' 표시를 지운다"""
    pid = _ws_where.pop(user_id, None)
    if pid is None:
        return
    _ws_state.get(pid, {}).pop(user_id, None)
    try:
        await _ws_broadcast(user_id, name, pid, None, False)
    except Exception:
        logger.exception("ws presence clear failed")
