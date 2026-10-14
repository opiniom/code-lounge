from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from database import get_db
from models import User, Notification
from schemas import NotificationResponse
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

@router.get("", response_model=List[NotificationResponse])
async def list_my_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """현재 사용자의 알림 목록 (최신 50건)"""
    stmt = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.id.desc())
        .limit(50)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [NotificationResponse.model_validate(r) for r in rows]


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """단일 알림 읽음 처리"""
    row = (await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    row.is_read = True
    await db.commit()
    await db.refresh(row)
    return NotificationResponse.model_validate(row)


@router.post("/read-all", status_code=status.HTTP_200_OK)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """모든 알림 읽음 처리"""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "모든 알림을 읽음 처리했습니다."}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """알림 삭제"""
    await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    await db.commit()
