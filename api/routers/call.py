"""팀원 전용 음성 통화방 (디스코드의 음성 채널처럼 프로젝트마다 여러 개).

- 음성은 팀원 브라우저끼리 WebRTC 로 직접 주고받는다 (서버를 거치지 않아 지연이 가장 작다).
  서로 다른 네트워크라 직접 연결이 안 될 때만 TURN 중계 서버(설정 필요)를 거친다.
- 이 서버는 연결을 맺기 위한 '신호'(SDP/ICE)만 웹소켓으로 중계하고, 누가 어느 방에 있는지 관리한다.
- 방: '기본 통화방'(key="main")은 저장하지 않고 프로젝트 이름을 그대로 따른다 → 프로젝트 이름을 바꾸면 같이 바뀐다.
  그 밖의 방은 팀원이 만들고(최대 8개) DB 에 저장된다.
- 방에 누가 있는지는 서버 메모리에서만 관리한다 (서버를 재시작하면 비워진다).
- 인증: 웹소켓을 연 뒤 첫 메시지로 로그인 토큰을 보낸다 (주소에 토큰을 싣지 않는다).
"""
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db, async_session_maker
from models import User, Project, CallRoom
from services.access import get_member_project
from services.auth_service import decode_access_token, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Call"])

MAX_PEERS = 6                 # 브라우저끼리 직접 연결(메시) 방식이라 소규모 팀용
MAX_ROOMS = 8                 # 프로젝트당 직접 만든 방 개수
AUTH_TIMEOUT_SECONDS = 10
MAX_MESSAGE_CHARS = 20000     # SDP 는 보통 수 KB
MAIN = "main"


class Peer:
    def __init__(self, peer_id: str, ws: WebSocket, user_id: int, name: str, project_id: int, room: str):
        self.id = peer_id
        self.ws = ws
        self.user_id = user_id
        self.name = name
        self.project_id = project_id
        self.room = room
        self.muted = False

    def info(self) -> dict:
        return {"id": self.id, "user_id": self.user_id, "name": self.name, "muted": self.muted}


# (프로젝트 id, 방 key) → {peer_id: Peer}
rooms: Dict[Tuple[int, str], Dict[str, Peer]] = {}


async def _send(peer: Peer, message: dict):
    try:
        await peer.ws.send_text(json.dumps(message, ensure_ascii=False))
    except Exception:
        pass


async def _broadcast(project_id: int, room: str, message: dict, exclude: Optional[str] = None):
    for peer in list(rooms.get((project_id, room), {}).values()):
        if peer.id != exclude:
            await _send(peer, message)


async def _close_quietly(ws: WebSocket, code: int = 4000):
    """상대가 응답하지 않아도 오래 붙잡히지 않게 제한 시간을 둔다"""
    try:
        await asyncio.wait_for(ws.close(code=code), timeout=2)
    except Exception:
        pass


def _clean_name(raw: str) -> str:
    name = re.sub(r"<[^>]*>", "", raw or "")          # HTML 조각(<b> 등)은 통째로 제거
    name = re.sub(r"[\x00-\x1f\x7f<>]", "", name)
    return re.sub(r"\s+", " ", name).strip()[:20]


def ice_config(user_id: int) -> Tuple[List[dict], bool]:
    """브라우저에 줄 ICE 서버 목록과, 중계(TURN) 서버가 설정돼 있는지 여부"""
    stun = [u.strip() for u in settings.STUN_URLS.split(",") if u.strip()]
    servers: List[dict] = [{"urls": stun}] if stun else []
    turn_urls = [u.strip() for u in settings.TURN_URLS.split(",") if u.strip()]
    relay = False
    if turn_urls:
        if settings.TURN_SECRET:
            # coturn REST 방식: 만료 시각이 들어간 임시 계정 (비밀키는 서버에만 있다)
            username = f"{int(time.time()) + settings.TURN_TTL_SECONDS}:{user_id}"
            credential = base64.b64encode(
                hmac.new(settings.TURN_SECRET.encode(), username.encode(), hashlib.sha1).digest()
            ).decode()
            servers.append({"urls": turn_urls, "username": username, "credential": credential})
            relay = True
        elif settings.TURN_USERNAME and settings.TURN_CREDENTIAL:
            servers.append({"urls": turn_urls, "username": settings.TURN_USERNAME, "credential": settings.TURN_CREDENTIAL})
            relay = True
    return servers, relay


async def close_project_rooms(project_id: int):
    """프로젝트가 삭제되면 그 프로젝트의 모든 통화방을 닫는다"""
    for key in [k for k in rooms if k[0] == project_id]:
        await _kick_room(key, "프로젝트가 삭제되어 통화방이 닫혔어요.")


async def _kick_room(key: Tuple[int, str], message: str):
    for peer in list(rooms.get(key, {}).values()):
        await _send(peer, {"type": "kicked", "message": message})
        await _close_quietly(peer.ws)
    rooms.pop(key, None)


async def _room_exists(db: AsyncSession, project_id: int, key: str) -> bool:
    if key == MAIN:
        return True
    if not key.isdigit():
        return False
    return (await db.execute(
        select(CallRoom.id).where(CallRoom.id == int(key), CallRoom.project_id == project_id)
    )).scalar_one_or_none() is not None


def _participants(project_id: int, key: str) -> List[dict]:
    return [{"user_id": p.user_id, "name": p.name, "muted": p.muted}
            for p in rooms.get((project_id, key), {}).values()]


async def _room_list(db: AsyncSession, project: Project, user: User) -> List[dict]:
    custom = (await db.execute(
        select(CallRoom).where(CallRoom.project_id == project.id).order_by(CallRoom.id)
    )).scalars().all()
    out = [{
        "key": MAIN, "name": project.title, "default": True, "can_delete": False,
        "participants": _participants(project.id, MAIN),
    }]
    for r in custom:
        out.append({
            "key": str(r.id), "name": r.name, "default": False,
            "can_delete": r.created_by == user.id or project.owner_id == user.id,
            "participants": _participants(project.id, str(r.id)),
        })
    return out


@router.get("/api/call/ice")
async def call_ice(current_user: User = Depends(get_current_user)):
    servers, relay = ice_config(current_user.id)
    return {"iceServers": servers, "relay": relay}


@router.get("/api/projects/{project_id}/call")
async def call_overview(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """프로젝트의 통화방 목록과, 각 방에 지금 누가 있는지"""
    project = await get_member_project(db, project_id, current_user)
    _, relay = ice_config(current_user.id)
    return {"rooms": await _room_list(db, project, current_user), "max": MAX_PEERS, "max_rooms": MAX_ROOMS, "relay": relay}


class RoomName(BaseModel):
    name: str = Field(..., min_length=1, max_length=40)


@router.post("/api/projects/{project_id}/call/rooms", status_code=201)
async def create_room(
    project_id: int,
    data: RoomName,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """통화방 만들기 (팀원 누구나, 프로젝트당 최대 8개)"""
    project = await get_member_project(db, project_id, current_user)
    name = _clean_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="방 이름을 입력해 주세요.")
    count = (await db.execute(select(func.count()).select_from(CallRoom).where(CallRoom.project_id == project_id))).scalar_one()
    if count >= MAX_ROOMS:
        raise HTTPException(status_code=400, detail=f"통화방은 프로젝트당 최대 {MAX_ROOMS}개까지 만들 수 있어요.")
    exists = (await db.execute(select(CallRoom.id).where(CallRoom.project_id == project_id, CallRoom.name == name))).first()
    if exists or name == project.title:
        raise HTTPException(status_code=400, detail="같은 이름의 통화방이 이미 있어요.")
    room = CallRoom(project_id=project_id, name=name, created_by=current_user.id)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return {"key": str(room.id), "name": room.name}


async def _get_custom_room(db: AsyncSession, project: Project, room_id: int, user: User) -> CallRoom:
    room = (await db.execute(
        select(CallRoom).where(CallRoom.id == room_id, CallRoom.project_id == project.id)
    )).scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="통화방을 찾을 수 없어요.")
    if room.created_by != user.id and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="방을 만든 사람이나 프로젝트 소유자만 바꿀 수 있어요.")
    return room


@router.patch("/api/projects/{project_id}/call/rooms/{room_id}")
async def rename_room(
    project_id: int, room_id: int, data: RoomName,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    project = await get_member_project(db, project_id, current_user)
    room = await _get_custom_room(db, project, room_id, current_user)
    name = _clean_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="방 이름을 입력해 주세요.")
    dup = (await db.execute(select(CallRoom.id).where(
        CallRoom.project_id == project_id, CallRoom.name == name, CallRoom.id != room_id))).first()
    if dup or name == project.title:
        raise HTTPException(status_code=400, detail="같은 이름의 통화방이 이미 있어요.")
    room.name = name
    await db.commit()
    return {"key": str(room.id), "name": room.name}


@router.delete("/api/projects/{project_id}/call/rooms/{room_id}", status_code=204)
async def delete_room(
    project_id: int, room_id: int,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    project = await get_member_project(db, project_id, current_user)
    room = await _get_custom_room(db, project, room_id, current_user)
    await db.delete(room)
    await db.commit()
    await _kick_room((project_id, str(room_id)), f"'{room.name}' 통화방이 삭제됐어요.")


@router.websocket("/ws/call/{project_id}/{room_key}")
async def call_socket(websocket: WebSocket, project_id: int, room_key: str):
    await websocket.accept()
    peer: Optional[Peer] = None
    key = (project_id, room_key)
    try:
        # 1) 인증: 첫 메시지가 {"type":"auth","token":"…"} 여야 한다
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
            first = json.loads(raw) if len(raw) <= MAX_MESSAGE_CHARS else {}
        except (asyncio.TimeoutError, ValueError):
            await websocket.close(code=4401)
            return
        payload = decode_access_token(first.get("token", "")) if first.get("type") == "auth" else None
        if not payload or not payload.get("sub"):
            await _send_error_and_close(websocket, "로그인이 필요해요.", 4401)
            return
        async with async_session_maker() as db:
            user = (await db.execute(select(User).where(User.id == int(payload["sub"])))).scalar_one_or_none()
            if user is None or not user.is_active:
                await _send_error_and_close(websocket, "로그인이 필요해요.", 4401)
                return
            try:
                await get_member_project(db, project_id, user)   # 팀원만
            except Exception:
                await _send_error_and_close(websocket, "이 프로젝트의 팀원만 들어올 수 있어요.", 4403)
                return
            if not await _room_exists(db, project_id, room_key):
                await _send_error_and_close(websocket, "통화방을 찾을 수 없어요. 삭제됐을 수 있어요.", 4404)
                return
            user_id, name = user.id, user.username

        # 같은 사람은 한 번에 한 방에만 있는다: 이 프로젝트의 다른 방(또는 다른 탭)에 있으면 이전 연결을 내보낸다
        for other_key in [k for k in rooms if k[0] == project_id]:
            for old in [p for p in rooms[other_key].values() if p.user_id == user_id]:
                await _send(old, {"type": "kicked", "message": "다른 곳에서 통화방에 들어와서 이전 연결을 종료했어요."})
                rooms[other_key].pop(old.id, None)
                await _broadcast(project_id, other_key[1], {"type": "peer-left", "id": old.id})
                await _close_quietly(old.ws)

        room = rooms.setdefault(key, {})
        if len(room) >= MAX_PEERS:
            await _send_error_and_close(websocket, f"통화방이 가득 찼어요 (최대 {MAX_PEERS}명).", 4409)
            return

        # 2) 입장
        peer = Peer(secrets.token_hex(6), websocket, user_id, name, project_id, room_key)
        existing = [p.info() for p in room.values()]
        room[peer.id] = peer
        await _send(peer, {"type": "welcome", "id": peer.id, "peers": existing, "max": MAX_PEERS, "room": room_key})
        await _broadcast(project_id, room_key, {"type": "peer-joined", "peer": peer.info()}, exclude=peer.id)

        # 3) 신호 중계
        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_MESSAGE_CHARS:
                continue
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            kind = msg.get("type")
            if kind == "signal":
                target = room.get(str(msg.get("to")))
                if target and target.id != peer.id and isinstance(msg.get("data"), dict):
                    await _send(target, {"type": "signal", "from": peer.id, "data": msg["data"]})
            elif kind == "state":
                peer.muted = bool(msg.get("muted"))
                await _broadcast(project_id, room_key, {"type": "state", "id": peer.id, "muted": peer.muted}, exclude=peer.id)
            elif kind == "ping":
                await _send(peer, {"type": "pong", "t": msg.get("t")})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("통화방 웹소켓 오류 (project=%s room=%s)", project_id, room_key)
    finally:
        if peer is not None:
            current = rooms.get(key, {})
            if current.get(peer.id) is peer:
                current.pop(peer.id, None)
                await _broadcast(project_id, room_key, {"type": "peer-left", "id": peer.id})
            if not current:
                rooms.pop(key, None)


async def _send_error_and_close(websocket: WebSocket, message: str, code: int):
    try:
        await websocket.send_text(json.dumps({"type": "error", "message": message}, ensure_ascii=False))
        await websocket.close(code=code)
    except Exception:
        pass
