import secrets
import urllib.parse
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User
from schemas import UserCreate, UserLogin, UserResponse, TokenResponse, SocialLoginRequest
from services.auth_service import hash_password, verify_password, create_access_token, get_current_user
from config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """새 사용자 회원가입 및 즉시 로그인 토큰 반환"""
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

    if not user or not user.hashed_password or not verify_password(credentials.password, user.hashed_password):
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

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자 프로필 조회"""
    return UserResponse.model_validate(current_user)

# ==========================================
# 소셜 로그인 (Google & Naver OAuth 2.0)
# ==========================================

@router.get("/config", tags=["OAuth"])
async def get_auth_config():
    """소셜 로그인 설정 활성화 여부 확인"""
    return {
        "google_enabled": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
        "naver_enabled": bool(settings.NAVER_CLIENT_ID and settings.NAVER_CLIENT_SECRET),
        "public_base_url": settings.PUBLIC_BASE_URL,
        "frontend_url": settings.FRONTEND_URL
    }

@router.get("/google/login", tags=["OAuth"])
async def google_login():
    """Google OAuth 2.0 인가 화면으로 리디렉션"""
    if not settings.GOOGLE_CLIENT_ID:
        return RedirectResponse(f"{settings.FRONTEND_URL}?social_info=google_keys_missing")
    
    redirect_uri = f"{settings.PUBLIC_BASE_URL}/api/auth/google/callback"
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account"
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return RedirectResponse(auth_url)

@router.get("/google/callback", tags=["OAuth"])
async def google_callback(
    code: Optional[str] = None, 
    error: Optional[str] = None, 
    db: AsyncSession = Depends(get_db)
):
    """Google OAuth 2.0 콜백 처리 및 JWT 발급"""
    if error or not code:
        return RedirectResponse(f"{settings.FRONTEND_URL}?social_error={error or 'cancelled'}")
    
    redirect_uri = f"{settings.PUBLIC_BASE_URL}/api/auth/google/callback"
    token_url = "https://oauth2.googleapis.com/token"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_res = await client.post(token_url, data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code"
            })
            if token_res.status_code != 200:
                return RedirectResponse(f"{settings.FRONTEND_URL}?social_error=token_exchange_failed")
            
            token_data = token_res.json()
            access_token = token_data.get("access_token")
            
            userinfo_res = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if userinfo_res.status_code != 200:
                return RedirectResponse(f"{settings.FRONTEND_URL}?social_error=userinfo_failed")
            
            userinfo = userinfo_res.json()
            email = userinfo.get("email")
            name = userinfo.get("name") or email.split("@")[0]
            sub = userinfo.get("sub")

        # 사용자 조회 또는 신규 생성
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                email=email,
                hashed_password="",
                username=name,
                oauth_provider="google",
                oauth_id=sub,
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        else:
            user.oauth_provider = "google"
            user.oauth_id = sub
            await db.commit()

        jwt_token = create_access_token(data={"sub": str(user.id), "email": user.email})
        safe_name = urllib.parse.quote(user.username)
        return RedirectResponse(f"{settings.FRONTEND_URL}?token={jwt_token}&provider=google&name={safe_name}")
    except Exception as e:
        return RedirectResponse(f"{settings.FRONTEND_URL}?social_error={urllib.parse.quote(str(e))}")

@router.get("/naver/login", tags=["OAuth"])
async def naver_login():
    """Naver 로그인 인가 화면으로 리디렉션"""
    if not settings.NAVER_CLIENT_ID:
        return RedirectResponse(f"{settings.FRONTEND_URL}?social_info=naver_keys_missing")
    
    state = secrets.token_urlsafe(16)
    redirect_uri = f"{settings.PUBLIC_BASE_URL}/api/auth/naver/callback"
    params = {
        "response_type": "code",
        "client_id": settings.NAVER_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "state": state
    }
    auth_url = f"https://nid.naver.com/oauth2.0/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(auth_url)

@router.get("/naver/callback", tags=["OAuth"])
async def naver_callback(
    code: Optional[str] = None, 
    state: Optional[str] = None, 
    error: Optional[str] = None, 
    db: AsyncSession = Depends(get_db)
):
    """Naver 로그인 콜백 처리 및 JWT 발급"""
    if error or not code:
        return RedirectResponse(f"{settings.FRONTEND_URL}?social_error={error or 'cancelled'}")
    
    token_url = "https://nid.naver.com/oauth2.0/token"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_res = await client.post(token_url, data={
                "grant_type": "authorization_code",
                "client_id": settings.NAVER_CLIENT_ID,
                "client_secret": settings.NAVER_CLIENT_SECRET,
                "code": code,
                "state": state
            })
            if token_res.status_code != 200:
                return RedirectResponse(f"{settings.FRONTEND_URL}?social_error=naver_token_failed")
            
            token_data = token_res.json()
            access_token = token_data.get("access_token")

            me_res = await client.get(
                "https://openapi.naver.com/v1/nid/me",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if me_res.status_code != 200:
                return RedirectResponse(f"{settings.FRONTEND_URL}?social_error=naver_profile_failed")
            
            me_data = me_res.json()
            profile = me_data.get("response", {})
            email = profile.get("email") or f"naver_{profile.get('id', 'user')}@naver.com"
            name = profile.get("name") or profile.get("nickname") or "네이버 사용자"
            nid = profile.get("id")

        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                email=email,
                hashed_password="",
                username=name,
                oauth_provider="naver",
                oauth_id=nid,
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        else:
            user.oauth_provider = "naver"
            user.oauth_id = nid
            await db.commit()

        jwt_token = create_access_token(data={"sub": str(user.id), "email": user.email})
        safe_name = urllib.parse.quote(user.username)
        return RedirectResponse(f"{settings.FRONTEND_URL}?token={jwt_token}&provider=naver&name={safe_name}")
    except Exception as e:
        return RedirectResponse(f"{settings.FRONTEND_URL}?social_error={urllib.parse.quote(str(e))}")

@router.post("/social", response_model=TokenResponse, tags=["OAuth"])
async def social_login(payload: SocialLoginRequest, db: AsyncSession = Depends(get_db)):
    """프론트엔드 직접 소셜 로그인 API (팝업 로그인 및 즉시 인증 지원)"""
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    
    if not user:
        user = User(
            email=payload.email,
            hashed_password="",
            username=payload.username,
            oauth_provider=payload.provider.lower(),
            oauth_id=payload.oauth_id,
            is_active=True
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        user.oauth_provider = payload.provider.lower()
        if payload.oauth_id:
            user.oauth_id = payload.oauth_id
        await db.commit()

    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )
