"""이벤트(공모전·해커톤·개발자 행사) API.

- 목록은 자동 수집(services/event_crawler.py)된 데이터 + 사용자가 직접 등록한 주소로 채운다. (가짜 예시 데이터는 없다)
- 서버가 켜져 있는 동안 일정 간격으로 알아서 최신화하고, 화면의 [지금 새로고침]으로 수동 갱신도 할 수 있다.
"""
import json
import re
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import CrawledEvent, EventCrawlRun, User
from schemas import CrawlUrlRequest, CrawledEventResponse, EventCrawlStatus, EventSourceStatus
from services import event_crawler as ec
from services.auth_service import get_current_user
from services.crawler import crawl_target_url

router = APIRouter(prefix="/api/events", tags=["Events"])

CATEGORIES = ("해커톤", "공모전", "대외활동", "세미나", "기타")
MANUAL_REFRESH_GAP = timedelta(minutes=5)      # [지금 새로고침]을 너무 자주 눌러 상대 사이트에 부담을 주지 않게
_DATE_RE = re.compile(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})")


def _parse_date(text: Optional[str]) -> Optional[date]:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _to_response(e: CrawledEvent, today: date, now: datetime, baselines: Optional[dict] = None) -> CrawledEventResponse:
    try:
        tags = json.loads(e.tags) if e.tags else []
    except ValueError:
        tags = []
    dl = e.deadline_date or _parse_date(e.deadline)
    closed = dl is not None and dl < today
    return CrawledEventResponse(
        id=e.id, url=e.url, title=e.title, category=e.category, host=e.host, deadline=dl.isoformat() if dl else e.deadline,
        d_day=ec.calc_dday(dl, today) if dl else (e.d_day or "접수중"), description=e.description, created_at=e.created_at,
        source=e.source or "manual", source_label=ec.SOURCE_LABELS.get(e.source or "manual", e.source),
        tags=[t for t in tags if isinstance(t, str)][:8], deadline_date=dl, starts_on=e.starts_on,
        is_new=_is_new(e, now, baselines or {}),
        is_closed=closed,
        image_url=e.image_url,
        deadline_kind="event" if (e.source == "devevent" and "접수 " not in (e.description or "")) else "apply",
    )


def _is_new(e: CrawledEvent, now: datetime, baselines: dict) -> bool:
    """최근 3일 안에 새로 발견된 것. 처음 한꺼번에 가져온 분량은 'NEW' 로 치지 않는다."""
    if e.source == "manual" or e.first_seen_at is None:
        return False
    base = baselines.get(e.source)
    if base is not None and e.first_seen_at - base < timedelta(hours=1):
        return False
    return now - e.first_seen_at <= timedelta(days=3)


async def _baselines(db: AsyncSession) -> dict:
    rows = (await db.execute(select(CrawledEvent.source, func.min(CrawledEvent.first_seen_at)).group_by(CrawledEvent.source))).all()
    return {src: first for src, first in rows}


def _visible_filter(now: datetime):
    # 직접 등록한 것은 항상, 자동 수집한 것은 최근에도 목록에서 확인된 것만
    return or_(CrawledEvent.source == "manual", CrawledEvent.last_seen_at >= now - timedelta(days=ec.VISIBLE_DAYS_AFTER_LAST_SEEN))


@router.get("", response_model=List[CrawledEventResponse])
async def list_events(
    category: Optional[str] = None,
    q: Optional[str] = None,
    include_closed: bool = False,
    sort: str = "deadline",
    db: AsyncSession = Depends(get_db),
):
    """수집된 공모전·해커톤·개발자 행사 목록. 기본은 접수중인 것만, 마감 임박 순."""
    now = datetime.utcnow(); today = date.today()
    stmt = select(CrawledEvent).where(_visible_filter(now))
    if category and category in CATEGORIES:
        stmt = stmt.where(CrawledEvent.category == category)
    if q and q.strip():
        like = f"%{q.strip()[:60]}%"
        stmt = stmt.where(or_(CrawledEvent.title.like(like), CrawledEvent.host.like(like), CrawledEvent.description.like(like), CrawledEvent.tags.like(like)))
    rows = (await db.execute(stmt.limit(1000))).scalars().all()
    base = await _baselines(db)
    items = [_to_response(r, today, now, base) for r in rows]
    if not include_closed:
        items = [i for i in items if not i.is_closed]
    by_id = {r.id: r for r in rows}
    if sort == "new":      # 새로 발견된 순
        items.sort(key=lambda i: (by_id[i.id].first_seen_at or by_id[i.id].created_at, i.id), reverse=True)
    else:   # 마감 임박 순 (마감일 없는 것은 뒤로, 이미 마감된 것은 맨 뒤)
        items.sort(key=lambda i: (i.is_closed, i.deadline_date is None, i.deadline_date or date.max, -i.id))
    return items


async def _status(db: AsyncSession, message: Optional[str] = None, running: Optional[bool] = None) -> EventCrawlStatus:
    now = datetime.utcnow(); today = date.today()
    last = (await db.execute(select(func.max(EventCrawlRun.finished_at)))).scalar_one_or_none()
    interval = max(1, settings.EVENT_CRAWL_INTERVAL_HOURS)
    names = [ec.SOURCE_ALIAS.get(n, n) for n in ec.enabled_sources()]
    sources = []
    for name in names:
        run = (await db.execute(select(EventCrawlRun).where(EventCrawlRun.source == name).order_by(EventCrawlRun.id.desc()).limit(1))).scalar_one_or_none()
        sources.append(EventSourceStatus(
            source=name, label=ec.SOURCE_LABELS.get(name, name), ok=run.ok if run else None, found=run.found if run else 0,
            added=run.added if run else 0, updated=run.updated if run else 0, error=run.error if run else None,
            last_run=run.finished_at if run else None))
    total = (await db.execute(select(func.count()).select_from(CrawledEvent).where(_visible_filter(now)))).scalar_one()
    open_count = (await db.execute(select(func.count()).select_from(CrawledEvent).where(
        _visible_filter(now), or_(CrawledEvent.deadline_date.is_(None), CrawledEvent.deadline_date >= today)))).scalar_one()
    return EventCrawlStatus(
        running=ec.is_running() if running is None else running, last_run=last,
        next_run=(last + timedelta(hours=interval)) if (last and settings.EVENT_CRAWL_ENABLED) else None,
        interval_hours=interval, enabled=settings.EVENT_CRAWL_ENABLED, total=total, open_count=open_count, sources=sources, message=message)


@router.get("/status", response_model=EventCrawlStatus)
async def crawl_status(db: AsyncSession = Depends(get_db)):
    """마지막 수집 시각, 출처별 결과(성공/실패 이유), 다음 자동 수집 예정 시각"""
    return await _status(db)


@router.post("/refresh", response_model=EventCrawlStatus)
async def refresh_now(
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지금 바로 다시 수집 (로그인한 사용자). 상대 사이트에 부담을 주지 않도록 5분에 한 번만."""
    if ec.is_running():
        return await _status(db, message="이미 수집하고 있어요. 잠시만 기다려 주세요.")
    last = (await db.execute(select(func.max(EventCrawlRun.finished_at)))).scalar_one_or_none()
    if last and datetime.utcnow() - last < MANUAL_REFRESH_GAP:
        wait = int((MANUAL_REFRESH_GAP - (datetime.utcnow() - last)).total_seconds() // 60) + 1
        return await _status(db, message=f"방금 갱신했어요. 약 {wait}분 뒤에 다시 새로고침할 수 있어요.")
    background.add_task(ec.refresh_all, "manual")
    return await _status(db, message="최신 정보를 가져오는 중이에요…", running=True)


@router.post("/crawl-url", response_model=CrawledEventResponse, status_code=status.HTTP_201_CREATED)
async def crawl_event_url(
    req: CrawlUrlRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사용자가 입력한 웹 주소(공고 페이지)를 읽어 이벤트 목록에 등록"""
    try:
        data = await crawl_target_url(req.url, req.category if req.category in CATEGORIES else None)
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    now = datetime.utcnow()
    dl = _parse_date(data["deadline"])
    key = ec.make_key("manual", data["url"])
    existing = (await db.execute(select(CrawledEvent).where(CrawledEvent.source == "manual", CrawledEvent.ext_key == key))).scalar_one_or_none()
    if existing:
        return _to_response(existing, date.today(), now)
    event = CrawledEvent(
        user_id=current_user.id, url=data["url"], title=data["title"], category=data["category"] if data["category"] in CATEGORIES else "기타",
        host=data["host"], deadline=data["deadline"], d_day=data["d_day"], description=data["description"],
        source="manual", ext_key=key, deadline_date=dl, first_seen_at=now, last_seen_at=now, tags="[]", image_url=data.get("image_url"), image_checked_at=now,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return _to_response(event, date.today(), now)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_crawled_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """직접 등록한 이벤트만 삭제 (등록한 사람). 자동 수집된 것은 다음 수집 때 다시 생기므로 삭제 대상이 아니다."""
    ev = (await db.execute(select(CrawledEvent).where(CrawledEvent.id == event_id))).scalar_one_or_none()
    if ev is None:
        raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없어요.")
    if ev.source != "manual":
        raise HTTPException(status_code=400, detail="자동으로 수집된 이벤트는 삭제할 수 없어요.")
    if ev.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="직접 등록한 사람만 삭제할 수 있어요.")
    await db.execute(delete(CrawledEvent).where(CrawledEvent.id == event_id))
    await db.commit()
