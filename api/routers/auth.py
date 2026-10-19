import logging
import re
import secrets
import urllib.parse
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User
from schemas import AiNameUpdate, UserLogin, UserResponse, TokenResponse, SocialLoginRequest
from services.auth_service import hash_password, verify_password, create_access_token, get_current_user
from config import settings

logger = logging.getLogger("oauth")


def _why(res) -> str:
    """소셜 로그인 제공자가 거부한 이유를 짧게 뽑는다 (토큰·비밀값은 절대 포함하지 않는다). 서버 로그와 화면 안내에 쓴다."""
    try:
        d = res.json()
    except Exception:
        return f"http{res.status_code}"
    if isinstance(d, dict):
        parts = [str(d.get(k)) for k in ("error", "error_description", "resultcode", "message") if d.get(k)]
        r = d.get("response")
        if not parts and isinstance(r, dict):
            parts = [str(r.get(k)) for k in ("resultcode", "message") if r.get(k)]
        if parts:
            return (f"http{res.status_code} " + " / ".join(parts))[:160]
    return f"http{res.status_code}"


def _fail(provider: str, step: str, detail: str):
    """실패를 서버 로그(docker compose logs app)에 남기고, 화면에는 원인 코드와 짧은 이유를 넘긴다"""
    logger.warning("%s login failed at %s: %s", provider, step, detail)
    return RedirectResponse(f"{settings.FRONTEND_URL}?social_error={provider}_{step}&reason={urllib.parse.quote(detail[:120])}")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

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

_AI_NAME_RE = re.compile(r"^[0-9A-Za-z가-힣_\-]{2,12}$")

@router.put("/me/ai-name", response_model=UserResponse)
async def set_ai_name(
    data: AiNameUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """채팅에서 AI 를 부를 이름 설정 (비우면 기본값 'AI')"""
    name = (data.ai_name or "").strip()
    if name and not _AI_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="AI 이름은 공백·특수문자 없이 한글/영문/숫자 2~12자로 정해주세요.")
    current_user.ai_name = name or None
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(current_user: User = Depends(get_current_user)):
    """유효한 토큰으로 새 토큰 발급 (접속할 때마다 로그인 유효기간 연장)"""
    token = create_access_token(data={"sub": str(current_user.id), "email": current_user.email})
    return TokenResponse(access_token=token, token_type="bearer", user=UserResponse.model_validate(current_user))

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자 프로필 조회"""
    return UserResponse.model_validate(current_user)

# ==========================================
# 소셜 로그인 (Google & Naver OAuth 2.0)
# ==========================================

def _dev_auto_allowed(request: Request) -> bool:
    """임시 서버 자동 로그인: 설정이 있고, 외부 공유 모드가 아니며, 프록시를 거치지 않은 내 컴퓨터 접속일 때만"""
    if not settings.DEV_AUTO_LOGIN_EMAIL or settings.PUBLIC_MODE:
        return False
    if request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip"):
        return False
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1", "localhost")


@router.post("/dev-auto", response_model=TokenResponse, tags=["OAuth"])
async def dev_auto_login(request: Request, db: AsyncSession = Depends(get_db)):
    """임시(로컬) 서버 전용 자동 로그인. 이미 있는 계정으로만 로그인하고, 계정을 만들지 않는다."""
    if not _dev_auto_allowed(request):
        raise HTTPException(status_code=404, detail="Not Found")
    user = (await db.execute(select(User).where(User.email == settings.DEV_AUTO_LOGIN_EMAIL))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="DEV_AUTO_LOGIN_EMAIL 계정이 아직 없어요. 한 번 정상 로그인해 계정을 만든 뒤 쓰세요.")
    token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return TokenResponse(access_token=token, token_type="bearer", user=UserResponse.model_validate(user))


@router.get("/config", tags=["OAuth"])
async def get_auth_config(request: Request):
    """소셜 로그인 설정 활성화 여부 확인"""
    return {
        "dev_auto_login": _dev_auto_allowed(request),
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
                return _fail("google", "token_failed", _why(token_res))
            
            token_data = token_res.json()
            access_token = token_data.get("access_token")
            if not access_token:
                return _fail("google", "token_failed", "no access_token")
            
            userinfo_res = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if userinfo_res.status_code != 200:
                return _fail("google", "profile_failed", _why(userinfo_res))
            
            userinfo = userinfo_res.json()
            email = userinfo.get("email")
            if not email:
                return _fail("google", "no_email", "구글 계정에서 이메일을 받지 못했어요")
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
            if not user.is_active:
                raise Exception("정지되었거나 비활성화된 계정이에요." + (f" ({user.ban_reason})" if user.ban_reason else ""))
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
                return _fail("naver", "token_failed", _why(token_res))
            
            token_data = token_res.json()
            access_token = token_data.get("access_token")
            if not access_token:                                      # 네이버는 실패해도 200 으로 오류 내용을 담아 보내는 경우가 있다
                return _fail("naver", "token_failed", str(token_data.get("error_description") or token_data.get("error") or "no access_token")[:120])

            me_res = await client.get(
                "https://openapi.naver.com/v1/nid/me",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if me_res.status_code != 200:
                return _fail("naver", "profile_failed", _why(me_res))
            
            me_data = me_res.json()
            if str(me_data.get("resultcode", "00")) != "00":           # 200 이어도 resultcode 가 00 이 아니면 실패
                return _fail("naver", "profile_failed", _why(me_res))
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
            if not user.is_active:
                raise Exception("정지되었거나 비활성화된 계정이에요." + (f" ({user.ban_reason})" if user.ban_reason else ""))
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
    """개발/테스트 전용 로그인 (이메일만으로 로그인). 기본 꺼짐 — 외부에 열린 서버에서 켜면 누구나 타인 계정으로 로그인할 수 있다."""
    if not settings.ALLOW_DEV_LOGIN or settings.PUBLIC_MODE:
        raise HTTPException(status_code=404, detail="Not Found")
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
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비활성화된 계정입니다.")
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
