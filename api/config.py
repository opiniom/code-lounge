import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "your-super-secret-jwt-key-for-local-development-change-in-prod-987654321"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")

    # PostgreSQL / Judge0 비밀번호
    POSTGRES_PASSWORD: str = "YourSecurePassword123"

    # 데이터베이스 설정 (기본: 로컬 비동기 SQLite 파일, 추후 PostgreSQL로 교체 가능)
    # Windows 는 기존 경로 유지, 그 외 OS 는 프로젝트 안의 data/app.db (c:/... 가 상대경로로 해석되는 문제 방지)
    DATABASE_URL: str = (
        "sqlite+aiosqlite:///c:/backend/data/app.db" if os.name == "nt"
        else "sqlite+aiosqlite:///" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "app.db").replace("\\", "/")
    )

    # 외부 공유 모드: ./share.sh 로 켜면 true. 코드 실행(내 컴퓨터에서 직접 실행됨)·API 문서·개발용 로그인을 모두 끈다
    PUBLIC_MODE: bool = False
    # 자바 GUI 창(CheerpJ)을 띄우는 별도 출처 주소 (예: https://gui.duresync.cloud). 비워 두면 같은 사이트 주소에서 띄운다.
    # 별도 출처를 쓰면 팀원이 올린 자바 코드가 내 로그인 정보가 있는 사이트와 완전히 분리돼서 더 안전하다.
    GUI_FRAME_ORIGIN: str = ""
    # 개발/테스트 전용: 이메일만으로 로그인하는 /api/auth/social 허용. 기본 꺼짐 (켜면 누구나 어떤 계정으로든 로그인 가능)
    ALLOW_DEV_LOGIN: bool = False
    # 임시(로컬) 서버 전용: 이 이메일의 '이미 있는' 계정으로 로그인 버튼 한 번에 자동 로그인. 내 컴퓨터(127.0.0.1)에서 직접 접속할 때만 동작하고 계정을 새로 만들지 않는다. 배포 서버에서는 비워 둘 것
    DEV_AUTO_LOGIN_EMAIL: str = ""

    # 사이트 관리자(최고관리자) 이메일. 쉼표 구분. 이 이메일로 로그인하면 /app/admin 관리자 페이지가 열린다.
    # 코드에 적지 말고 서버의 .env 에만 넣을 것 (공개 저장소). 최고관리자가 화면에서 '운영자'를 추가로 지정할 수 있다.
    ADMIN_EMAILS: str = ""

    # 대화형 터미널(/ws/terminal) 한 번 실행의 최대 시간(초). 이 시간이 지나면 강제로 끝낸다 (무한 반복 방지)
    TERMINAL_MAX_SECONDS: int = 300

    # 팀 통화방(WebRTC) 연결 서버. 같은 네트워크 밖(다른 집·카페 등)에서 연결하려면 TURN 중계 서버가 필요하다.
    #  - STUN: 내 공인 주소를 알아내는 용도 (무료 공용 서버)
    #  - TURN: 직접 연결이 막힌 경우 음성을 대신 전달 (직접 운영하는 coturn, Metered, Cloudflare Calls 등) — 계정/서버가 필요
    STUN_URLS: str = "stun:stun.l.google.com:19302"
    TURN_URLS: str = ""            # 쉼표 구분, 예: turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tcp
    TURN_USERNAME: str = ""        # 고정 계정 방식 (Metered 등)
    TURN_CREDENTIAL: str = ""
    TURN_SECRET: str = ""          # coturn 의 static-auth-secret 방식: 서버가 시간 제한 계정을 만들어 준다
    TURN_TTL_SECONDS: int = 86400

    # 이벤트(공모전·해커톤) 자동 수집
    EVENT_CRAWL_ENABLED: bool = True
    EVENT_CRAWL_INTERVAL_HOURS: int = 6
    EVENT_SOURCES: str = "devevent,wevity,contestkorea"   # 쓸 출처 (쉼표 구분): devevent, wevity, contestkorea, feeds
    EVENT_IMAGE_BATCH: int = 60                 # 한 번 수집할 때 포스터를 새로 찾아볼 최대 페이지 수 (0 이면 포스터 수집 끔)
    EVENT_FEEDS: str = ""                       # 추가로 읽을 RSS/Atom 주소 (쉼표 구분)

    # JWT 인증 설정
    JWT_SECRET_KEY: str = _DEFAULT_JWT_SECRET   # 기본값이면 아래에서 서버별 무작위 키로 자동 교체됨
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30일 (접속할 때마다 /api/auth/refresh 로 연장)
    
    # Judge0 엔드포인트
    JUDGE0_URL: str = "http://judge0-server:2358"
    
    # CORS 설정 (쉼표 구분)
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app"
    
    # 실행 제한 정책
    DEFAULT_TIMEOUT_SECONDS: float = 5.0
    MAX_TIMEOUT_SECONDS: float = 10.0
    DEFAULT_MEMORY_LIMIT_KB: int = 524288  # 512MB

    # 소셜 로그인 (OAuth 2.0)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""
    PUBLIC_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "/ui"
    FRONTEND_DIR: str = ""

    # 회의록 일정 분석 AI (선택). 우선순위: Gemini → Claude → 규칙 기반(키 불필요)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    # 위 모델의 무료 한도(429)가 차면 순서대로 시도할 모델 (쉼표 구분)
    GEMINI_FALLBACK_MODELS: str = "gemini-flash-lite-latest,gemini-3.1-flash-lite"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-haiku-4-5-20251001"
    
    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()


def _ensure_private_jwt_secret():
    """JWT 서명키가 코드에 공개된 기본값 그대로면, 서버마다 고유한 무작위 키를 만들어 data/.jwt_secret 에 저장해 쓴다.
    (기본값을 아는 누구나 로그인 토큰을 위조할 수 있기 때문. 배포 환경에서는 JWT_SECRET_KEY 환경변수로 직접 지정하는 것을 권장)"""
    import logging
    import secrets
    if settings.JWT_SECRET_KEY and settings.JWT_SECRET_KEY != _DEFAULT_JWT_SECRET and len(settings.JWT_SECRET_KEY) >= 16:
        return   # 직접 지정한 키가 있으면 그대로 사용 (빈 값이거나 너무 짧으면 자동 생성)
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    path = os.path.join(data_dir, ".jwt_secret")
    try:
        os.makedirs(data_dir, exist_ok=True)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                value = f.read().strip()
        else:
            value = ""
        if len(value) < 32:
            value = secrets.token_hex(32)
            with open(path, "w", encoding="utf-8") as f:
                f.write(value)
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
        settings.JWT_SECRET_KEY = value
    except OSError:
        # 저장할 수 없는 환경이면 이번 실행 동안만 쓰는 임시 키 (재시작하면 다시 로그인)
        settings.JWT_SECRET_KEY = secrets.token_hex(32)
        logging.getLogger(__name__).warning("JWT_SECRET_KEY 가 기본값이라 임시 키를 사용합니다. 환경변수로 직접 지정하세요.")


_ensure_private_jwt_secret()
