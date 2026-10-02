from dataclasses import dataclass
from typing import Optional, Dict
from urllib.parse import urlencode
import httpx
from config import settings

class OAuthError(Exception):
    """사용자에게 그대로 보여줘도 되는 소셜 로그인 오류"""

@dataclass
class OAuthProfile:
    provider: str
    provider_id: str
    email: Optional[str]
    email_verified: bool
    name: str

PROVIDERS: Dict[str, dict] = {
    "google": {
        "label": "Google",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "profile_url": "https://openidconnect.googleapis.com/v1/userinfo",
    },
    "naver": {
        "label": "네이버",
        "authorize_url": "https://nid.naver.com/oauth2.0/authorize",
        "token_url": "https://nid.naver.com/oauth2.0/token",
        "profile_url": "https://openapi.naver.com/v1/nid/me",
    },
}

def _credentials(provider: str):
    if provider == "google":
        return settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET
    return settings.NAVER_CLIENT_ID, settings.NAVER_CLIENT_SECRET

def is_configured(provider: str) -> bool:
    client_id, client_secret = _credentials(provider)
    return bool(client_id and client_secret)

def redirect_uri(provider: str) -> str:
    """제공자 콘솔에 등록해야 하는 콜백 URL"""
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/auth/{provider}/callback"

def build_authorize_url(provider: str, state: str) -> str:
    client_id, _ = _credentials(provider)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "state": state,
    }
    if provider == "google":
        params["scope"] = "openid email profile"
        params["prompt"] = "select_account"
    return f"{PROVIDERS[provider]['authorize_url']}?{urlencode(params)}"

async def fetch_profile(provider: str, code: str, state: str) -> OAuthProfile:
    """인가 코드를 액세스 토큰으로 교환한 뒤 사용자 프로필을 조회"""
    cfg = PROVIDERS[provider]
    client_id, client_secret = _credentials(provider)
    label = cfg["label"]

    token_form = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if provider == "google":
        token_form["redirect_uri"] = redirect_uri(provider)
    else:
        token_form["state"] = state

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(cfg["token_url"], data=token_form)
            token_json = token_resp.json()
            access_token = token_json.get("access_token")
            if not access_token:
                raise OAuthError(f"{label} 인증 토큰을 받지 못했어요. 다시 시도해주세요.")

            profile_resp = await client.get(
                cfg["profile_url"], headers={"Authorization": f"Bearer {access_token}"}
            )
            data = profile_resp.json()
    except OAuthError:
        raise
    except Exception:
        raise OAuthError(f"{label} 서버와 통신하지 못했어요. 잠시 후 다시 시도해주세요.")

    if provider == "google":
        if not data.get("sub"):
            raise OAuthError("Google 프로필을 불러오지 못했어요.")
        email = data.get("email")
        return OAuthProfile(
            provider="google",
            provider_id=str(data["sub"]),
            email=email.lower() if email else None,
            email_verified=bool(data.get("email_verified")),
            name=data.get("name") or (email.split("@")[0] if email else "Google 사용자"),
        )

    info = data.get("response") or {}
    if data.get("resultcode") != "00" or not info.get("id"):
        raise OAuthError("네이버 프로필을 불러오지 못했어요.")
    email = info.get("email")
    return OAuthProfile(
        provider="naver",
        provider_id=str(info["id"]),
        email=email.lower() if email else None,
        email_verified=bool(email),  # 네이버 계정 이메일은 가입 시 인증된 주소
        name=info.get("name") or info.get("nickname") or (email.split("@")[0] if email else "네이버 사용자"),
    )
