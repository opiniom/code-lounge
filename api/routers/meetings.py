import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from database import get_db
from models import User, MeetingDoc, Project, CalendarEvent
from schemas import MeetingDocCreate, MeetingDocUpdate, MeetingDocResponse, StructureRequest, StructureResponse
from services.auth_service import get_current_user
from services.access import get_member_project, member_project_ids
from services.schedule_ai import structure_meeting

router = APIRouter(prefix="/api/meetings", tags=["Meetings"])

def _to_response(doc: MeetingDoc, viewer: Optional[User] = None, names: Optional[dict] = None, owners: Optional[dict] = None) -> MeetingDocResponse:
    try:
        attendees = json.loads(doc.attendees or "[]")
    except ValueError:
        attendees = []
    try:
        detections = json.loads(doc.detections or "[]")
    except ValueError:
        detections = []
    try:
        structure = json.loads(doc.structure) if doc.structure else None
    except ValueError:
        structure = None
    return MeetingDocResponse(
        id=doc.id, structure=structure, detections=detections, project_id=doc.project_id, title=doc.title, doc_date=doc.doc_date,
        attendees=[str(a) for a in attendees], raw=doc.raw or "", status=doc.status,
        author_id=doc.user_id, author=(names or {}).get(doc.user_id),
        can_edit=bool(viewer is None or doc.user_id == viewer.id or (doc.project_id and (owners or {}).get(doc.project_id) == viewer.id)),
    )

async def _get_owned(db: AsyncSession, doc_id: int, user: User) -> MeetingDoc:
    """수정·삭제할 수 있는 회의록: 내가 쓴 것, 또는 내가 소유한 프로젝트의 것"""
    doc = (await db.execute(select(MeetingDoc).where(MeetingDoc.id == doc_id))).scalar_one_or_none()
    if doc and doc.user_id != user.id:
        owner = (await db.execute(select(Project.owner_id).where(Project.id == doc.project_id))).scalar_one_or_none() if doc.project_id else None
        if owner != user.id:
            doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")
    return doc


async def _decorate(db: AsyncSession, docs, viewer: User):
    """작성자 이름·프로젝트 소유자 정보를 한 번에 가져와 응답으로 만든다"""
    uids = {d.user_id for d in docs}
    pids = {d.project_id for d in docs if d.project_id}
    names = {u.id: u.username for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    owners = {p.id: p.owner_id for p in (await db.execute(select(Project).where(Project.id.in_(pids)))).scalars().all()} if pids else {}
    return [_to_response(d, viewer, names, owners) for d in docs]

async def _check_project(db: AsyncSession, project_id, user: User):
    if project_id is None:
        return
    await get_member_project(db, project_id, user)

@router.post("/structure", response_model=StructureResponse)
async def structure(data: StructureRequest, current_user: User = Depends(get_current_user)):
    """회의 메모를 AI 가 논의·결정사항·액션아이템으로 정리 (저장은 하지 않음)"""
    try:
        r = await structure_meeting(data.lines, data.title)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="지금은 AI가 정리하지 못했어요 (사용 한도 또는 네트워크 문제).")
    clean = lambda xs: [str(x).strip() for x in xs if str(x).strip()]
    return StructureResponse(engine=r["engine"], title=(r.get("title") or None),
                             discussion=clean(r["discussion"]), decisions=clean(r["decisions"]), actions=clean(r["actions"]))

@router.get("", response_model=List[MeetingDocResponse])
async def list_meetings(
    project_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 내가 쓴 회의록 + 내가 속한 프로젝트의 팀원들이 쓴 회의록
    mine_ids = await member_project_ids(db, current_user)
    query = select(MeetingDoc).where(or_(MeetingDoc.user_id == current_user.id, MeetingDoc.project_id.in_(mine_ids or [-1])))
    if project_id is not None:
        query = query.where(MeetingDoc.project_id == project_id)
    rows = (await db.execute(
        query.order_by(MeetingDoc.doc_date.desc(), MeetingDoc.id.desc())
    )).scalars().all()
    return await _decorate(db, rows, current_user)

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
        structure=json.dumps(data.structure, ensure_ascii=False) if data.structure else None,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return (await _decorate(db, [doc], current_user))[0]

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
    if data.structure is not None:
        doc.structure = json.dumps(data.structure, ensure_ascii=False)
    if data.detections is not None:
        encoded = json.dumps(data.detections, ensure_ascii=False)
        if len(encoded) > 30000:
            raise HTTPException(status_code=400, detail="감지 결과가 너무 큽니다.")
        doc.detections = encoded
    if data.attendees is not None:
        doc.attendees = json.dumps(data.attendees, ensure_ascii=False)
    if data.raw is not None:
        doc.raw = data.raw
    if data.status is not None:
        doc.status = data.status
    await db.commit()
    await db.refresh(doc)
    return (await _decorate(db, [doc], current_user))[0]

@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, doc_id, current_user)
    # 이 회의록에서 AI 가 만든 캘린더 일정도 함께 지운다 (직접 추가한 일정은 건드리지 않음)
    await db.execute(
        delete(CalendarEvent).where(
            CalendarEvent.meeting_doc_id == doc_id,
            CalendarEvent.kind == "ai",
        )
    )
    await db.delete(doc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{doc_id}/events")
async def delete_doc_events(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """회의록 내용이 수정될 때, 이 회의록에서 AI 가 만들었던 캘린더 일정을 지운다 (새 내용으로 다시 분석하기 위해)"""
    await _get_owned(db, doc_id, current_user)
    result = await db.execute(
        delete(CalendarEvent).where(
            CalendarEvent.meeting_doc_id == doc_id,
            CalendarEvent.kind == "ai",
        )
    )
    await db.commit()
    return {"deleted": result.rowcount or 0}
