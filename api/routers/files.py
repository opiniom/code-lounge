import re
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import User, Project, ProjectFile, CodeMemo
from schemas import FileSave, FileBulk, FileRename, FileResponse_
from services.auth_service import get_current_user
from services.access import get_member_project
from services import livedoc

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["Workspace Files"])

MAX_FILES = 500                        # 프로젝트당 파일 수 (예전 300개)
MAX_PROJECT_CHARS = 3_000_000          # 프로젝트 전체 글자 수. 워크스페이스를 열 때 서버가 파일 내용을 전부 읽어 보내서, 작은 서버(메모리 1GB)가 버틸 수 있게 낮게 둔다
MAX_USER_CHARS = 20_000_000            # 한 사용자가 만든 모든 프로젝트의 글자 수 합계 (한 사람이 서버 디스크를 채우지 못하게)
_BAD_CHARS = re.compile(r'[\x00-\x1f\\:*?"<>|]')


def _norm(path: str) -> str:
    return re.sub(r"/+", "/", (path or "").strip().strip("/"))


def _clean_path(path: str) -> str:
    """새로 만들거나 옮길 '목적지' 경로 검사. 폴더/파일 이름 한 칸씩 확인한다 (a..b.txt 같은 정상 이름은 허용, '.' '..' '...' 처럼 점만 있는 이름은 거부)."""
    p = _norm(path)
    if not p or len(p) > 300:
        raise HTTPException(status_code=400, detail="파일 경로가 올바르지 않아요. (예: src/main.py)")
    for seg in p.split("/"):
        if not seg.strip(".") :
            raise HTTPException(status_code=400, detail=f"'{seg}' 처럼 점(.)으로만 된 이름은 쓸 수 없어요.")
        if seg != seg.strip() or seg.endswith("."):
            raise HTTPException(status_code=400, detail="이름의 앞뒤 공백이나 끝의 마침표는 쓸 수 없어요.")
        if _BAD_CHARS.search(seg):
            raise HTTPException(status_code=400, detail='이름에 \\ : * ? " < > | 문자는 쓸 수 없어요.')
        if len(seg) > 120:
            raise HTTPException(status_code=400, detail="이름이 너무 길어요. (최대 120자)")
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


async def _check_room(db: AsyncSession, project_id: int, add_chars: int) -> None:
    """내용이 add_chars 글자만큼 늘어날 때 프로젝트·사용자 용량 한도를 넘는지 확인한다 (줄이거나 같은 크기로 고치는 건 언제나 허용)"""
    if add_chars <= 0:
        return
    own = project_id and (await db.execute(select(Project.owner_id).where(Project.id == project_id))).scalar_one_or_none()
    proj = (await db.execute(select(func.coalesce(func.sum(func.length(ProjectFile.content)), 0)).where(ProjectFile.project_id == project_id))).scalar_one()
    if proj + add_chars > MAX_PROJECT_CHARS:
        raise HTTPException(status_code=400, detail=f"프로젝트 전체 용량이 너무 커요. 지금 약 {proj / 1_000_000:.1f}MB에 {add_chars / 1_000_000:.1f}MB를 더하면 최대 {MAX_PROJECT_CHARS // 1_000_000}MB를 넘어요. 큰 데이터 파일은 빼고 저장해 주세요.")
    if own:
        mine = (await db.execute(select(func.coalesce(func.sum(func.length(ProjectFile.content)), 0)).join(Project, Project.id == ProjectFile.project_id).where(Project.owner_id == own))).scalar_one()
        if mine + add_chars > MAX_USER_CHARS:
            raise HTTPException(status_code=400, detail=f"이 계정이 만든 프로젝트 전체 용량이 한도({MAX_USER_CHARS // 1_000_000}MB)에 가까워요. 안 쓰는 프로젝트나 파일을 정리한 뒤 다시 시도해 주세요.")


async def _save_one(db: AsyncSession, project_id: int, user: User, data: FileSave, check_room: bool = True):
    """(file, conflict_row) 반환. 충돌이면 file 은 None"""
    path = _clean_path(data.path)
    row = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id, ProjectFile.path == path))).scalar_one_or_none()
    if check_room:
        await _check_room(db, project_id, len(data.content) - (len(row.content or "") if row is not None else 0))
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
    await livedoc.external_change(project_id, row.path)          # 같은 파일을 실시간으로 편집 중인 화면이 있으면 새 내용을 다시 받게 한다
    return _out(row, {row.updated_by: current_user.username})


@router.put("/bulk", response_model=List[FileResponse_])
async def save_bulk(project_id: int, data: FileBulk, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """폴더 가져오기 등: 여러 파일을 한 번에 저장 (같은 경로는 덮어쓰기)"""
    await get_member_project(db, project_id, current_user)
    # 하나라도 한도를 넘으면 하나도 저장하지 않고(반만 가져와지지 않게) 얼마나 줄여야 하는지 알려 준다
    paths = {_clean_path(i.path): len(i.content) for i in data.files}
    have = dict((await db.execute(select(ProjectFile.path, func.length(ProjectFile.content)).where(ProjectFile.project_id == project_id))).all())
    new_count = sum(1 for pth in paths if pth not in have)
    if len(have) + new_count > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"파일이 너무 많아요. 지금 {len(have)}개 + 새로 가져올 {new_count}개 = {len(have) + new_count}개인데, 프로젝트당 최대 {MAX_FILES}개까지예요. {len(have) + new_count - MAX_FILES}개 이상 줄여 주세요.")
    await _check_room(db, project_id, sum(paths.values()) - sum(have.get(pth, 0) or 0 for pth in paths))
    saved = []
    for item in data.files:
        item.force = True
        row, _ = await _save_one(db, project_id, current_user, item, check_room=False)       # 한도는 위에서 한 번에 확인했다
        saved.append(row)
        await db.flush()
    await db.commit()
    for r in saved:
        await db.refresh(r)
        await livedoc.external_change(project_id, r.path)
    return [_out(r, {r.updated_by: current_user.username}) for r in saved]


@router.post("/rename", response_model=FileResponse_)
async def rename_file(project_id: int, data: FileRename, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_member_project(db, project_id, current_user)
    src, dst = _norm(data.from_path), _clean_path(data.to_path)      # 원본은 이미 저장돼 있는 이름 그대로(옛 이름이 규칙에 안 맞아도 옮길 수 있게)
    row = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id, ProjectFile.path == src))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없어요.")
    exists = (await db.execute(select(ProjectFile.id).where(ProjectFile.project_id == project_id, ProjectFile.path == dst))).scalar_one_or_none()
    if exists is not None and dst != src:
        raise HTTPException(status_code=400, detail="같은 이름의 파일이 이미 있어요.")
    row.path = dst
    await db.execute(update(CodeMemo).where(CodeMemo.project_id == project_id, CodeMemo.path == src).values(path=dst))      # 이름을 바꿔도 코드 줄 메모는 따라간다
    row.updated_by = current_user.id
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    await livedoc.external_change(project_id, src)
    await livedoc.external_change(project_id, dst)
    return _out(row, {row.updated_by: current_user.username})


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(project_id: int, path: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_member_project(db, project_id, current_user)
    p = _norm(path)              # 삭제는 저장된 이름 그대로 찾는다 (규칙에 안 맞는 옛 파일도 지울 수 있어야 한다)
    if not p:
        raise HTTPException(status_code=400, detail="삭제할 경로가 비어 있어요.")
    # 폴더 경로면 그 아래 파일 전체 삭제
    await db.execute(delete(ProjectFile).where(
        ProjectFile.project_id == project_id,
        (ProjectFile.path == p) | (ProjectFile.path.like(p + "/%")),
    ))
    await db.execute(delete(CodeMemo).where(CodeMemo.project_id == project_id, (CodeMemo.path == p) | (CodeMemo.path.like(p + "/%"))))     # 파일을 지우면 그 파일의 줄 메모도 함께
    await db.commit()
    await livedoc.external_change(project_id, p, prefix=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
