from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, Project
from schemas import ProjectCreate, ProjectResponse
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectResponse])
async def list_projects(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """내가 만든 프로젝트 목록 (최신순)"""
    result = await db.execute(
        select(Project).where(Project.owner_id == current_user.id).order_by(Project.id.desc())
    )
    return result.scalars().all()

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(owner_id=current_user.id, title=data.title.strip())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project
