import re
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import User, ProjectFile
from schemas import FileSave, FileBulk, FileRename, FileResponse_
from services.auth_service import get_current_user
from services.access import get_member_project

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["Workspace Files"])

MAX_FILES = 300
_BAD_PATH = re.compile(r"(^/)|(\\)|(\.\.)|([\x00-\x1f])")


def _clean_path(path: str) -> str:
    p = re.sub(r"/+", "/", path.strip().strip("/"))
    if not p or _BAD_PATH.search(p) or len(p) > 300:
        raise HTTPException(status_code=400, detail="파일 경로가 올바르지 않아요. (예: src/main.py)")
    return p


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


async def _names(db: AsyncSession, rows: List[ProjectFile]) -> dict:
    ids = {r.updated_by for r in rows if r.updated_by}
    if not ids:
        return {}
    users = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {u.id: u.username for u in users}


def _out(f: ProjectFile, names: dict) -> FileResponse_:
    return FileResponse_(path=f.path, content=f.content, updated_at=_iso(f.updated_at), updated_by=names.get(f.updated_by))


@router.get("", response_model=List[FileResponse_])
async def list_files(project_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_member_project(db, project_id, current_user)
    rows = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id).order_by(ProjectFile.path))).scalars().all()
    names = await _names(db, rows)
    return [_out(r, names) for r in rows]


async def _save_one(db: AsyncSession, project_id: int, user: User, data: FileSave):
    """(file, conflict_row) 반환. 충돌이면 file 은 None"""
    path = _clean_path(data.path)
    row = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id, ProjectFile.path == path))).scalar_one_or_none()
    if row is None:
        count = (await db.execute(select(func.count(ProjectFile.id)).where(ProjectFile.project_id == project_id))).scalar_one()
        if count >= MAX_FILES:
            raise HTTPException(status_code=400, detail=f"프로젝트당 파일은 최대 {MAX_FILES}개까지 만들 수 있어요.")
        row = ProjectFile(project_id=project_id, path=path, content=data.content, updated_by=user.id)
        db.add(row)
        return row, None
    # 내가 받은 버전 이후에 '다른 팀원'이 고쳤다면 덮어쓰지 않고 알려준다
    if data.base_updated_at and not data.force and row.updated_by != user.id and row.content != data.content:
        if _iso(row.updated_at) != data.base_updated_at:
            return None, row
    row.content = data.content
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    return row, None


@router.put("", response_model=FileResponse_)
async def save_file(project_id: int, data: FileSave, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_member_project(db, project_id, current_user)
    row, conflict = await _save_one(db, project_id, current_user, data)
    if conflict is not None:
        names = await _names(db, [conflict])
        return JSONResponse(status_code=409, content={"detail": "다른 팀원이 먼저 수정했어요.", "file": _out(conflict, names).model_dump()})
    await db.commit()
    await db.refresh(row)
    return _out(row, {row.updated_by: current_user.username})


@router.put("/bulk", response_model=List[FileResponse_])
async def save_bulk(project_id: int, data: FileBulk, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """폴더 가져오기 등: 여러 파일을 한 번에 저장 (같은 경로는 덮어쓰기)"""
    await get_member_project(db, project_id, current_user)
    saved = []
    for item in data.files:
        item.force = True
        row, _ = await _save_one(db, project_id, current_user, item)
        saved.append(row)
        await db.flush()
    await db.commit()
    for r in saved:
        await db.refresh(r)
    return [_out(r, {r.updated_by: current_user.username}) for r in saved]


@router.post("/rename", response_model=FileResponse_)
async def rename_file(project_id: int, data: FileRename, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_member_project(db, project_id, current_user)
    src, dst = _clean_path(data.from_path), _clean_path(data.to_path)
    row = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id, ProjectFile.path == src))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없어요.")
    exists = (await db.execute(select(ProjectFile.id).where(ProjectFile.project_id == project_id, ProjectFile.path == dst))).scalar_one_or_none()
    if exists is not None and dst != src:
        raise HTTPException(status_code=400, detail="같은 이름의 파일이 이미 있어요.")
    row.path = dst
    row.updated_by = current_user.id
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _out(row, {row.updated_by: current_user.username})


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(project_id: int, path: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_member_project(db, project_id, current_user)
    p = _clean_path(path)
    # 폴더 경로면 그 아래 파일 전체 삭제
    await db.execute(delete(ProjectFile).where(
        ProjectFile.project_id == project_id,
        (ProjectFile.path == p) | (ProjectFile.path.like(p + "/%")),
    ))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
