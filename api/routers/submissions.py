from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import User, Submission
from schemas import SubmissionResponse, SubmissionListResponse
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/submissions", tags=["Submissions"])

@router.get("", response_model=SubmissionListResponse)
async def list_my_submissions(
    skip: int = Query(0, ge=0, description="건너뛸 항목 수"),
    limit: int = Query(20, ge=1, le=100, description="가져올 최대 항목 수"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """현재 로그인한 사용자의 코드 실행 이력 목록 조회"""
    # 총 개수
    total_result = await db.execute(
        select(func.count()).select_from(Submission).where(Submission.user_id == current_user.id)
    )
    total = total_result.scalar_one()

    # 페이지네이션 쿼리
    stmt = (
        select(Submission)
        .where(Submission.user_id == current_user.id)
        .order_by(Submission.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    submissions = result.scalars().all()

    return SubmissionListResponse(
        total=total,
        items=[SubmissionResponse.model_validate(s) for s in submissions]
    )

@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """특정 코드 실행 결과 상세 조회"""
    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.user_id == current_user.id
        )
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 실행 이력을 찾을 수 없습니다."
        )

    return SubmissionResponse.model_validate(submission)
