import json
import re
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, async_session_maker
from models import User, ChatMessage, CalendarEvent
from schemas import ChatMessageCreate, ChatMessageResponse, CalendarEventResponse
from services.auth_service import get_current_user
from services.access import get_member_project
from services.schedule_ai import detect_chat

router = APIRouter(prefix="/api/projects/{project_id}/messages", tags=["Chat"])

# AI 분석을 돌릴 만한 메시지인지 가볍게 거르는 힌트 (날짜·시간 표현 또는 '할게요' 류 약속 표현)
_HINT_RE = re.compile(
    r"(까지|내일|모레|오늘|이번|다음|요일|주말|오전|오후|저녁|아침|밤|\d{1,2}\s*(월|일|시)|\d{1,2}[/:]\d{1,2}"
    r"|할게|하겠|맡을게|맡겠|해볼게|제가|내가|담당|맡아)"
)


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


def _to_response(msg: ChatMessage, author: str) -> ChatMessageResponse:
    meta = None
    if msg.meta:
        try:
            meta = json.loads(msg.meta)
        except ValueError:
            meta = None
    return ChatMessageResponse(
        id=msg.id, project_id=msg.project_id, user_id=msg.user_id, author=author,
        kind=msg.kind, text=msg.text, meta=meta, created_at=_iso(msg.created_at),
    )


async def _author_names(db: AsyncSession, msgs: List[ChatMessage]) -> dict:
    ids = {m.user_id for m in msgs if m.user_id}
    if not ids:
        return {}
    users = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {u.id: u.username for u in users}


@router.get("", response_model=List[ChatMessageResponse])
async def list_messages(
    project_id: int,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_member_project(db, project_id, current_user)
    rows = (await db.execute(
        select(ChatMessage).where(ChatMessage.project_id == project_id)
        .order_by(ChatMessage.id.desc()).limit(max(1, min(limit, 300)))
    )).scalars().all()
    rows.reverse()
    names = await _author_names(db, rows)
    return [_to_response(m, names.get(m.user_id, "AI" if m.kind == "ai_detect" else "알 수 없음")) for m in rows]


async def analyze_message(project_id: int, message_id: int):
    """새 메시지 하나가 올라올 때마다 백그라운드에서 실행: 대화 맥락으로 '누가 언제까지' 약속을 찾는다."""
    try:
        async with async_session_maker() as db:
            recent = (await db.execute(
                select(ChatMessage).where(
                    ChatMessage.project_id == project_id, ChatMessage.kind == "user", ChatMessage.id <= message_id
                ).order_by(ChatMessage.id.desc()).limit(12)
            )).scalars().all()
            recent.reverse()
            if not recent or recent[-1].id != message_id or not _HINT_RE.search(recent[-1].text):
                return
            names = await _author_names(db, recent)
            lines = [(names.get(m.user_id, "?"), m.text) for m in recent]
            engine, _note, events = await detect_chat(lines, date.today())
            if not events:
                return
            existing = (await db.execute(
                select(ChatMessage).where(ChatMessage.project_id == project_id, ChatMessage.kind == "ai_detect")
                .order_by(ChatMessage.id.desc()).limit(50)
            )).scalars().all()
            known = set()
            for m in existing:
                try:
                    meta = json.loads(m.meta or "{}")
                    known.add((meta.get("title"), meta.get("start_date")))
                except ValueError:
                    pass
            for e in events:
                if (e["title"], e["start_date"].isoformat()) in known:
                    continue
                meta = {
                    "title": e["title"], "assignee": e.get("assignee", ""),
                    "start_date": e["start_date"].isoformat(), "end_date": e["end_date"].isoformat(),
                    "start_time": e["start_time"], "end_time": e["end_time"],
                    "source": e["source"], "engine": engine, "status": "pending",
                }
                db.add(ChatMessage(
                    project_id=project_id, user_id=None, kind="ai_detect",
                    text=e["title"], meta=json.dumps(meta, ensure_ascii=False),
                ))
            await db.commit()
    except Exception:
        # 분석 실패가 채팅 전송에 영향을 주지 않도록 조용히 종료
        return


@router.post("", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    project_id: int,
    data: ChatMessageCreate,
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_member_project(db, project_id, current_user)
    msg = ChatMessage(project_id=project_id, user_id=current_user.id, kind="user", text=data.text.strip())
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    background.add_task(analyze_message, project_id, msg.id)
    return _to_response(msg, current_user.username)


async def _get_detection(db: AsyncSession, project_id: int, message_id: int) -> ChatMessage:
    msg = (await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == message_id, ChatMessage.project_id == project_id, ChatMessage.kind == "ai_detect"
        )
    )).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="감지된 일정을 찾을 수 없습니다.")
    return msg


@router.post("/{message_id}/apply", response_model=CalendarEventResponse)
async def apply_detection(
    project_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI 가 채팅에서 찾은 일정을 프로젝트 캘린더에 추가"""
    await get_member_project(db, project_id, current_user)
    msg = await _get_detection(db, project_id, message_id)
    meta = json.loads(msg.meta or "{}")
    if meta.get("status") == "added" and meta.get("event_id"):
        existing = (await db.execute(select(CalendarEvent).where(CalendarEvent.id == meta["event_id"]))).scalar_one_or_none()
        if existing:
            return existing
    title = meta["title"] + (f" · {meta['assignee']}" if meta.get("assignee") else "")
    event = CalendarEvent(
        user_id=current_user.id, project_id=project_id, title=title[:200],
        start_date=date.fromisoformat(meta["start_date"]), end_date=date.fromisoformat(meta["end_date"]),
        start_time=meta.get("start_time"), end_time=meta.get("end_time"),
        all_day=meta.get("start_time") is None, kind="ai", source=(meta.get("source") or "")[:300],
    )
    db.add(event)
    await db.flush()
    meta["status"] = "added"
    meta["event_id"] = event.id
    msg.meta = json.dumps(meta, ensure_ascii=False)
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{message_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_detection(
    project_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_member_project(db, project_id, current_user)
    msg = await _get_detection(db, project_id, message_id)
    meta = json.loads(msg.meta or "{}")
    if meta.get("status") == "pending":
        meta["status"] = "dismissed"
        msg.meta = json.dumps(meta, ensure_ascii=False)
        await db.commit()
