"""워크스페이스 '글자 단위 실시간 공동 편집' (WebSocket /ws/live 위에서 동작).

같은 파일을 연 팀원끼리 한 글자 한 글자가 쳐지는 순간 서로의 화면에 나타난다(저장이나 Enter 를 기다리지 않는다).
  · 서버가 파일마다 '방'을 하나 두고 편집의 순서를 정한다. 동시에 같은 곳을 고쳐도 변환 규칙(services/ot.py)으로 모두 같은 결과가 된다.
  · 방의 내용은 서버가 알아서 DB 에 저장한다(마지막 입력 0.8초 뒤, 마지막 사람이 나가면 바로). 화면은 저장 요청을 따로 보내지 않는다.
  · 방은 메모리에만 있다. 서버를 껐다 켜면 사라지고, 화면은 예전 방식(저장 + 충돌 확인)으로 자연스럽게 돌아간다.
통신(화면 → 서버, t="doc"): {a:"join", project_id, path, cid} · {a:"op", project_id, path, rev, ops, cid} · {a:"save"} · {a:"leave"}
통신(서버 → 화면): docsync(전체 내용) · docop(순서가 정해진 편집, 내 것이면 '받았다'는 뜻) · docsaved(저장됨) · docreset(다시 받아 가라) · docerr
"""
import asyncio
import json
import logging
import zlib
from datetime import datetime
from typing import Dict, Optional, Tuple

from fastapi import WebSocket
from sqlalchemy import select

from services import ot

logger = logging.getLogger("livedoc")
MAX_UNITS = 600_000               # 파일 하나 최대 글자 수 (저장 한도 30만 자의 2배 여유)
HIST_MAX = 800                    # 늦게 온 편집을 순서에 맞게 고치기 위해 기억해 두는 최근 편집 수
PERSIST_DELAY = 0.8               # 마지막 입력 후 이 시간(초)이 지나면 DB 에 저장
SEND_TIMEOUT = 3.0                # 느린 화면 하나 때문에 방 전체가 멈추지 않게

Key = Tuple[int, str]
_rooms: Dict[Key, "Room"] = {}
_conn_room: Dict[WebSocket, Key] = {}
_load_lock = asyncio.Lock()


def _norm(path) -> str:
    return "/".join(p for p in str(path or "").strip().strip("/").split("/") if p)[:300]


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


class Room:
    def __init__(self, pid: int, path: str, text: str, updated_at: str) -> None:
        self.pid, self.path = pid, path
        self.buf = ot.to_buf(text)
        self.rev = 0
        self.hist: list = []              # hist[i] = 편집 번호(hist_base + i + 1) 의 (변환된) 연산 목록
        self.hist_base = 0
        self.clients: Dict[WebSocket, dict] = {}
        self.lock = asyncio.Lock()
        self.last_user: Optional[int] = None
        self.last_name: Optional[str] = None
        self.persisted_rev = 0
        self.updated_at = updated_at
        self.task: Optional[asyncio.Task] = None
        self.closing = False

    def crc(self) -> int:
        return zlib.adler32(bytes(self.buf))


async def _send(ws: WebSocket, text: str) -> bool:
    try:
        await asyncio.wait_for(ws.send_text(text), SEND_TIMEOUT)
        return True
    except Exception:
        return False


def _dump(obj: dict) -> str:
    return json.dumps(obj, separators=(",", ":"))          # ensure_ascii 기본값: 짝 없는 서로게이트도 \uXXXX 로 그대로 전달


async def _bcast(room: Room, obj: dict) -> None:
    text = _dump(obj)
    items = list(room.clients.keys())
    results = await asyncio.gather(*[_send(w, text) for w in items], return_exceptions=True)
    for w, ok in zip(items, results):
        if ok is not True:
            room.clients.pop(w, None)
            _conn_room.pop(w, None)


def _sync_msg(room: Room) -> dict:
    return {"t": "docsync", "project_id": room.pid, "path": room.path, "rev": room.rev, "text": ot.buf_text(room.buf), "crc": room.crc(), "at": room.updated_at}


async def _load(pid: int, path: str) -> Optional[Room]:
    from database import async_session_maker
    from models import ProjectFile
    async with async_session_maker() as db:
        row = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == pid, ProjectFile.path == path))).scalar_one_or_none()
        if row is None:
            return None
        text = (row.content or "").replace("\r\n", "\n").replace("\r", "\n")      # 편집기와 같은 기준(LF)으로 맞춘다
        if len(text) > MAX_UNITS:
            return None
        return Room(pid, path, text, _iso(row.updated_at))


async def persist(room: Room) -> bool:
    """방의 현재 내용을 DB 에 저장하고, 방 안의 모든 화면에 '저장됨'을 알린다"""
    from database import async_session_maker
    from models import ProjectFile
    rev, uid, text = room.rev, room.last_user, ot.buf_text(room.buf, safe=True)
    if rev == room.persisted_rev:
        return True
    try:
        async with async_session_maker() as db:
            row = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == room.pid, ProjectFile.path == room.path))).scalar_one_or_none()
            if row is None:
                return False
            if row.content != text:
                row.content = text
                row.updated_by = uid
                row.updated_at = datetime.utcnow()
                db.sync_session.info["nolive_files"] = True          # 글자 단위로 이미 전해졌으니 '파일이 바뀌었다'는 일반 알림은 생략
                await db.commit()
                await db.refresh(row)
            room.updated_at = _iso(row.updated_at)
        room.persisted_rev = rev
    except Exception:
        logger.exception("livedoc persist failed")
        return False
    if room.clients:
        await _bcast(room, {"t": "docsaved", "project_id": room.pid, "path": room.path, "rev": rev, "at": room.updated_at, "by": room.last_name, "crc": room.crc() if rev == room.rev else None, "len": len(room.buf) // 2 if rev == room.rev else None})
    return True


async def _persist_later(room: Room) -> None:
    try:
        while True:
            await asyncio.sleep(PERSIST_DELAY)
            async with room.lock:
                if room.closing:
                    return
                await persist(room)
                if room.persisted_rev == room.rev:
                    return
    finally:
        room.task = None


def _schedule(room: Room) -> None:
    if room.task is None or room.task.done():
        room.task = asyncio.get_running_loop().create_task(_persist_later(room))


async def leave(ws: WebSocket) -> None:
    key = _conn_room.pop(ws, None)
    room = _rooms.get(key) if key else None
    if not room:
        return
    async with room.lock:
        room.clients.pop(ws, None)
        if not room.clients and not room.closing:
            room.closing = True
            await persist(room)
            if _rooms.get(key) is room:
                _rooms.pop(key, None)


async def join(ws: WebSocket, user, pid: int, path: str, cid: str) -> None:
    from services import live
    path = _norm(path)
    if user.id not in await live._audience(pid) or not path:
        await _send(ws, _dump({"t": "docerr", "project_id": pid, "path": path, "why": "forbidden"}))
        return
    await leave(ws)
    for _ in range(3):
        key = (pid, path)
        async with _load_lock:
            room = _rooms.get(key)
            if room is None:
                room = await _load(pid, path)
                if room is None:
                    await _send(ws, _dump({"t": "docerr", "project_id": pid, "path": path, "why": "missing"}))
                    return
                _rooms[key] = room
        async with room.lock:
            if room.closing:
                continue
            room.clients[ws] = {"uid": user.id, "name": user.username, "cid": str(cid)[:24]}
            _conn_room[ws] = key
            await _send(ws, _dump(_sync_msg(room)))
            return
    await _send(ws, _dump({"t": "docerr", "project_id": pid, "path": path, "why": "busy"}))


async def apply_op(ws: WebSocket, user, pid: int, path: str, rev, raw_ops) -> None:
    key = _conn_room.get(ws)
    room = _rooms.get(key) if key else None
    if room is None or key != (pid, _norm(path)):
        await _send(ws, _dump({"t": "docreset", "project_id": pid, "path": _norm(path)}))
        return
    ops = ot.parse_ops(raw_ops)
    async with room.lock:
        if room.closing or ws not in room.clients:
            return
        if ops is None or isinstance(rev, bool) or not isinstance(rev, int) or rev < room.hist_base or rev > room.rev:
            await _send(ws, _dump(_sync_msg(room)))               # 형식 오류 · 너무 오래된 기준 → 전체를 다시 받아 가게 한다
            return
        t = ops
        for h in room.hist[rev - room.hist_base:]:
            t, _ = ot.xform_lists(t, h, False)                  # 나보다 먼저 정해진 편집들을 반영 (같은 자리면 먼저 정해진 쪽이 왼쪽)
        n = ot.valid_ops(len(room.buf) // 2, t)
        if n is None or n > MAX_UNITS:
            await _send(ws, _dump(_sync_msg(room)))
            return
        ot.apply_ops(room.buf, t)
        room.rev += 1
        room.hist.append(t)
        if len(room.hist) > HIST_MAX:
            cut = HIST_MAX // 4
            del room.hist[:cut]
            room.hist_base += cut
        room.last_user = user.id
        room.last_name = user.username
        info = room.clients[ws]
        msg = {"t": "docop", "project_id": pid, "path": room.path, "rev": room.rev, "cid": info["cid"], "uid": user.id, "name": user.username, "ops": [list(o) for o in t]}
        if room.rev % 25 == 0:
            msg["crc"] = room.crc(); msg["len"] = len(room.buf) // 2
        await _bcast(room, msg)
        _schedule(room)


async def save_now(ws: WebSocket) -> None:
    key = _conn_room.get(ws)
    room = _rooms.get(key) if key else None
    if room:
        async with room.lock:
            await persist(room)


async def external_change(pid: int, path: Optional[str] = None, prefix: bool = False) -> None:
    """REST 로 파일이 저장·이름 변경·삭제되면(방 밖에서 내용이 바뀜) 그 방을 닫고 화면들이 새 내용을 다시 받게 한다"""
    path = _norm(path) if path else None
    for key, room in list(_rooms.items()):
        if key[0] != pid:
            continue
        if path is not None and not (key[1] == path or (prefix and key[1].startswith(path + "/"))):
            continue
        async with room.lock:
            room.closing = True
            if _rooms.get(key) is room:
                _rooms.pop(key, None)
            targets = list(room.clients.keys())
            room.clients.clear()
        text = _dump({"t": "docreset", "project_id": pid, "path": key[1]})
        for w in targets:
            if _conn_room.get(w) == key:
                _conn_room.pop(w, None)
            await _send(w, text)


async def handle(ws: WebSocket, user, d: dict) -> None:
    a = d.get("a")
    pid = d.get("project_id")
    if a == "leave":
        await leave(ws)
    elif a == "save":
        await save_now(ws)
    elif not isinstance(pid, int) or isinstance(pid, bool):
        return
    elif a == "join" and isinstance(d.get("path"), str):
        await join(ws, user, pid, d["path"], d.get("cid") or "")
    elif a == "op" and isinstance(d.get("path"), str):
        await apply_op(ws, user, pid, d["path"], d.get("rev"), d.get("ops"))
