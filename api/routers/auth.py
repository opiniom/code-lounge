import secrets
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from config import settings
from database import get_db
from models import User, SocialAccount
from schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from services.auth_service import hash_password, verify_password, create_access_token, get_current_user
from services.oauth_service import (
    PROVIDERS, OAuthError, OAuthProfile, is_configured, build_authorize_url, fetch_profile,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """새 사용자 회원가입 및 즉시 로그인 토큰 반환"""
    # 중복 이메일 점검
    existing = await db.execute(select(User).where(User.email == user_data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 등록된 이메일 주소입니다."
        )

    new_user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        username=user_data.username,
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # JWT 토큰 생성
    token = create_access_token(data={"sub": str(new_user.id), "email": new_user.email})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user)
    )

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """이메일과 비밀번호로 로그인 및 JWT 토큰 발급"""
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 일치하지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다."
        )

    token = create_access_token(data={"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

# ================================
# 소셜 로그인 (Google / Naver) - 서버 측 Authorization Code 방식
# ================================
STATE_COOKIE = "oauth_nonce"

def _back_to_frontend(fragment: dict, response_cookie_clear: bool = True) -> RedirectResponse:
    """결과(토큰/오류)를 URL fragment(#)로 프론트에 전달. fragment 는 서버 로그에 남지 않는다."""
    resp = RedirectResponse(f"{settings.FRONTEND_URL}#{urlencode(fragment)}", status_code=302)
    if response_cookie_clear:
        resp.delete_cookie(STATE_COOKIE)
    return resp

async def _upsert_social_user(db: AsyncSession, profile: OAuthProfile) -> User:
    """제공자 ID로 기존 계정을 찾고, 없으면 인증된 이메일로 연결하거나 새로 가입시킨다."""
    now = datetime.utcnow()
    result = await db.execute(
        select(SocialAccount).where(
            SocialAccount.provider == profile.provider,
            SocialAccount.provider_id == profile.provider_id,
        )
    )
    social = result.scalar_one_or_none()
    if social:
        social.last_login_at = now
        user = (await db.execute(select(User).where(User.id == social.user_id))).scalar_one()
        await db.commit()
        return user

    user = None
    if profile.email and profile.email_verified:
        user = (await db.execute(select(User).where(User.email == profile.email))).scalar_one_or_none()

    if user is None:
        # 이메일이 없거나 미인증이면 충돌을 피하기 위해 가상 주소를 사용
        email = profile.email if (profile.email and profile.email_verified) else f"{profile.provider}-{profile.provider_id}@oauth.invalid"
        user = User(
            email=email,
            hashed_password="",  # 소셜 전용 계정: 비밀번호 로그인 불가
            username=profile.name[:100],
            is_active=True,
        )
        db.add(user)
        await db.flush()

    db.add(SocialAccount(
        user_id=user.id,
        provider=profile.provider,
        provider_id=profile.provider_id,
        email=profile.email,
        last_login_at=now,
    ))
    await db.commit()
    await db.refresh(user)
    return user

@router.get("/providers")
async def list_providers():
    """프론트가 로그인 버튼 활성 여부를 판단하기 위한 설정 상태"""
    return {name: is_configured(name) for name in PROVIDERS}

@router.get("/{provider}/login")
async def social_login(provider: str):
    """제공자 로그인 화면으로 이동"""
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="지원하지 않는 로그인 방식입니다.")
    label = PROVIDERS[provider]["label"]
    if not is_configured(provider):
        return _back_to_frontend({"auth_error": f"{label} 로그인 키가 아직 설정되지 않았어요. .env 를 확인해주세요."})

    nonce = secrets.token_urlsafe(16)
    state = jwt.encode(
        {"nonce": nonce, "provider": provider, "exp": datetime.utcnow() + timedelta(minutes=10)},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    resp = RedirectResponse(build_authorize_url(provider, state), status_code=302)
    resp.set_cookie(
        STATE_COOKIE, nonce, max_age=600, httponly=True, samesite="lax",
        secure=settings.PUBLIC_BASE_URL.startswith("https"),
    )
    return resp

@router.get("/{provider}/callback")
async def social_callback(
    provider: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """제공자가 인가 코드를 들고 돌아오는 주소 → 사용자 기록 후 JWT 발급"""
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="지원하지 않는 로그인 방식입니다.")
    if error or not code or not state:
        return _back_to_frontend({"auth_error": "로그인을 취소했거나 완료하지 못했어요."})

    # CSRF 방지: state(JWT)의 nonce 와 이 브라우저에 심어둔 쿠키가 같아야 한다
    try:
        payload = jwt.decode(state, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return _back_to_frontend({"auth_error": "로그인 요청이 만료됐어요. 다시 시도해주세요."})
    if payload.get("provider") != provider or payload.get("nonce") != request.cookies.get(STATE_COOKIE):
        return _back_to_frontend({"auth_error": "잘못된 로그인 요청이에요. 다시 시도해주세요."})

    try:
        profile = await fetch_profile(provider, code, state)
    except OAuthError as e:
        return _back_to_frontend({"auth_error": str(e)})

    user = await _upsert_social_user(db, profile)
    if not user.is_active:
        return _back_to_frontend({"auth_error": "비활성화된 계정입니다."})

    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return _back_to_frontend({"token": token})

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자 프로필 조회"""
    return UserResponse.model_validate(current_user)
