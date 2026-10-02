from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models import User, Project, CalendarEvent, MeetingDoc
from schemas import (
    CalendarEventCreate, CalendarEventResponse, DetectRequest, DetectResponse, DetectedEvent,
)
from services.auth_service import get_current_user
from services.access import member_project_ids, get_member_project
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
    """프로젝트 일정 조회 (내가 멤버인 프로젝트). 다른 팀원의 'private' 일정은 제외. start~end 와 겹치는 일정만 반환"""
    ids = await member_project_ids(db, current_user)
    if project_id is not None:
        ids = [i for i in ids if i == project_id]
    query = select(CalendarEvent).where(
        CalendarEvent.project_id.in_(ids or [-1]),
        or_(CalendarEvent.kind != "private", CalendarEvent.user_id == current_user.id),
    )
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
    project = await get_member_project(db, data.project_id, current_user)

    end_date = data.end_date or data.start_date
    if end_date < data.start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 빠를 수 없습니다.")

    doc_id = None
    if data.meeting_doc_id is not None:
        owned = (await db.execute(
            select(MeetingDoc.id).where(MeetingDoc.id == data.meeting_doc_id, MeetingDoc.user_id == current_user.id)
        )).scalar_one_or_none()
        doc_id = owned   # 내 회의록이 아니면 연결하지 않음

    event = CalendarEvent(
        user_id=current_user.id,
        meeting_doc_id=doc_id,
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
    event = (await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    project = await get_member_project(db, event.project_id, current_user)
    if event.user_id != current_user.id and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="일정을 만든 사람이나 프로젝트 소유자만 삭제할 수 있어요.")
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
