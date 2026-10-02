from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, Project, CalendarEvent
from schemas import (
    CalendarEventCreate, CalendarEventResponse, DetectRequest, DetectResponse, DetectedEvent,
)
from services.auth_service import get_current_user
from services.schedule_ai import detect_events

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])

@router.get("/events", response_model=List[CalendarEventResponse])
async def list_events(
    project_id: Optional[int] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내 일정 조회. start~end 와 기간이 겹치는 일정만 반환 (여러 날 일정 포함)"""
    query = select(CalendarEvent).where(CalendarEvent.user_id == current_user.id)
    if project_id is not None:
        query = query.where(CalendarEvent.project_id == project_id)
    if start is not None:
        query = query.where(CalendarEvent.end_date >= start)
    if end is not None:
        query = query.where(CalendarEvent.start_date <= end)
    result = await db.execute(query.order_by(CalendarEvent.start_date, CalendarEvent.start_time))
    return result.scalars().all()

@router.post("/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = (await db.execute(
        select(Project).where(Project.id == data.project_id, Project.owner_id == current_user.id)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    end_date = data.end_date or data.start_date
    if end_date < data.start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 빠를 수 없습니다.")

    event = CalendarEvent(
        user_id=current_user.id,
        project_id=project.id,
        title=data.title.strip(),
        start_date=data.start_date,
        end_date=end_date,
        start_time=data.start_time,
        end_time=data.end_time,
        all_day=data.start_time is None,
        kind=data.kind,
        source=data.source,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event

@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = (await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event_id, CalendarEvent.user_id == current_user.id)
    )).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    await db.delete(event)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/detect", response_model=DetectResponse)
async def detect(data: DetectRequest, current_user: User = Depends(get_current_user)):
    """회의록 본문에서 일정(시작~종료)을 찾아 후보로 반환. 캘린더에는 아직 저장하지 않는다."""
    engine, note, events = await detect_events(
        data.text, data.reference_date or date.today(), data.title
    )
    return DetectResponse(engine=engine, note=note, events=[DetectedEvent(**e) for e in events])
