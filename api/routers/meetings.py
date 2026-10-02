import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, MeetingDoc, Project
from schemas import MeetingDocCreate, MeetingDocUpdate, MeetingDocResponse
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/meetings", tags=["Meetings"])

def _to_response(doc: MeetingDoc) -> MeetingDocResponse:
    try:
        attendees = json.loads(doc.attendees or "[]")
    except ValueError:
        attendees = []
    return MeetingDocResponse(
        id=doc.id, project_id=doc.project_id, title=doc.title, doc_date=doc.doc_date,
        attendees=[str(a) for a in attendees], raw=doc.raw or "", status=doc.status,
    )

async def _get_owned(db: AsyncSession, doc_id: int, user: User) -> MeetingDoc:
    doc = (await db.execute(
        select(MeetingDoc).where(MeetingDoc.id == doc_id, MeetingDoc.user_id == user.id)
    )).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")
    return doc

async def _check_project(db: AsyncSession, project_id, user: User):
    if project_id is None:
        return
    found = (await db.execute(
        select(Project.id).where(Project.id == project_id, Project.owner_id == user.id)
    )).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

@router.get("", response_model=List[MeetingDocResponse])
async def list_meetings(
    project_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(MeetingDoc).where(MeetingDoc.user_id == current_user.id)
    if project_id is not None:
        query = query.where(MeetingDoc.project_id == project_id)
    rows = (await db.execute(
        query.order_by(MeetingDoc.doc_date.desc(), MeetingDoc.id.desc())
    )).scalars().all()
    return [_to_response(r) for r in rows]

@router.post("", response_model=MeetingDocResponse, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    data: MeetingDocCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project(db, data.project_id, current_user)
    doc = MeetingDoc(
        user_id=current_user.id, project_id=data.project_id, title=data.title.strip(), doc_date=data.doc_date,
        attendees=json.dumps(data.attendees, ensure_ascii=False), raw=data.raw, status=data.status,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)

@router.patch("/{doc_id}", response_model=MeetingDocResponse)
async def update_meeting(
    doc_id: int,
    data: MeetingDocUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, doc_id, current_user)
    if data.project_id is not None:
        await _check_project(db, data.project_id, current_user)
        doc.project_id = data.project_id
    if data.title is not None:
        doc.title = data.title.strip()
    if data.attendees is not None:
        doc.attendees = json.dumps(data.attendees, ensure_ascii=False)
    if data.raw is not None:
        doc.raw = data.raw
    if data.status is not None:
        doc.status = data.status
    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, doc_id, current_user)
    await db.delete(doc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
