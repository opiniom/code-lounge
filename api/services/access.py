"""프로젝트 접근 권한: 소유자이거나 멤버로 초대된 사용자만 프로젝트의 채팅/캘린더에 접근한다."""
from typing import List
from fastapi import HTTPException
from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession
from models import User, Project, ProjectMember


async def member_project_ids(db: AsyncSession, user: User) -> List[int]:
    q = union(
        select(Project.id).where(Project.owner_id == user.id),
        select(ProjectMember.project_id).where(ProjectMember.user_id == user.id),
    )
    return [row[0] for row in (await db.execute(q)).all()]


async def get_member_project(db: AsyncSession, project_id: int, user: User) -> Project:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    if project.owner_id != user.id:
        is_member = (await db.execute(
            select(ProjectMember.id).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        )).scalar_one_or_none()
        if is_member is None:
            raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    return project


async def project_users(db: AsyncSession, project: Project) -> List[User]:
    """소유자 + 멤버 (중복 없이, 소유자 먼저)"""
    ids = [project.owner_id] + [row[0] for row in (await db.execute(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project.id).order_by(ProjectMember.id)
    )).all()]
    seen, ordered = set(), []
    for uid in ids:
        if uid not in seen:
            seen.add(uid)
            ordered.append(uid)
    users = (await db.execute(select(User).where(User.id.in_(ordered)))).scalars().all()
    by_id = {u.id: u for u in users}
    return [by_id[i] for i in ordered if i in by_id]
