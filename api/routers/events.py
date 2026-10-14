from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from database import get_db
from models import User, CrawledEvent
from schemas import CrawlUrlRequest, CrawledEventResponse
from services.auth_service import get_current_user_optional
from services.crawler import crawl_target_url, PRESET_EVENTS, _calc_dday

router = APIRouter(prefix="/api/events", tags=["Events"])

@router.get("", response_model=List[CrawledEventResponse])
async def list_events(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """실제 크롤링된 해커톤/공모전 이벤트 목록 조회"""
    stmt = select(CrawledEvent).order_by(CrawledEvent.id.desc())
    if category and category != "전체":
        stmt = stmt.where(CrawledEvent.category == category)
    db_events = (await db.execute(stmt)).scalars().all()

    items = []
    # 1. DB에 저장된 크롤링 이벤트
    for e in db_events:
        d_day = _calc_dday(e.deadline) if e.deadline else (e.d_day or "접수중")
        items.append(CrawledEventResponse(
            id=e.id,
            url=e.url,
            title=e.title,
            category=e.category,
            host=e.host,
            deadline=e.deadline,
            d_day=d_day,
            description=e.description,
            created_at=e.created_at
        ))

    # 2. 기본 프리셋 이벤트 병합 (DB에 없을 경우)
    for p in PRESET_EVENTS:
        if not category or category == "전체" or p["category"] == category:
            items.append(CrawledEventResponse(
                id=p["id"],
                url=p["url"],
                title=p["title"],
                category=p["category"],
                host=p["host"],
                deadline=p["deadline"],
                d_day=_calc_dday(p["deadline"]),
                description=p["description"],
                created_at=datetime.fromisoformat(p["created_at"].replace("Z", ""))
            ))

    return items


@router.post("/crawl-url", response_model=CrawledEventResponse, status_code=status.HTTP_201_CREATED)
async def crawl_event_url(
    req: CrawlUrlRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """사용자가 입력한 임의의 웹사이트 주소를 실시간 크롤링하여 이벤트 목록에 등록"""
    data = await crawl_target_url(req.url, req.category)

    event = CrawledEvent(
        user_id=current_user.id if current_user else None,
        url=data["url"],
        title=data["title"],
        category=data["category"],
        host=data["host"],
        deadline=data["deadline"],
        d_day=data["d_day"],
        description=data["description"]
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    return CrawledEventResponse.model_validate(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_crawled_event(
    event_id: int,
    db: AsyncSession = Depends(get_db)
):
    """크롤링된 이벤트 삭제"""
    if event_id < 0:
        return  # 프리셋 이벤트는 삭제 무시
    await db.execute(delete(CrawledEvent).where(CrawledEvent.id == event_id))
    await db.commit()
