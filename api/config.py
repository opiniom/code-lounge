import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

# 프로젝트 루트 (api/ 의 상위 폴더). .env 와 기본 SQLite 파일 위치 기준
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    # 데이터베이스 설정 (기본: 로컬 비동기 SQLite 파일, 추후 PostgreSQL로 교체 가능)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{(BASE_DIR / 'data' / 'app.db').as_posix()}"
    )

    # JWT 인증 설정
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "your-super-secret-jwt-key-for-local-development-change-in-prod-987654321"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24시간

    # 소셜 로그인 (OAuth 2.0). 비어 있으면 해당 로그인 버튼은 "설정 필요"로 동작
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""
    # 이 서버가 외부에서 접근되는 주소 (OAuth 콜백 URL 생성에 사용)
    PUBLIC_BASE_URL: str = "http://localhost:8000"
    # 로그인 완료 후 돌아갈 프론트엔드 주소
    FRONTEND_URL: str = "/app"
    # UI(index.html)가 들어있는 폴더. 지정하면 서버가 /app 으로 index.html 한 파일만 서빙
    FRONTEND_DIR: str = ""

    # 회의록 일정 분석 AI (선택). 우선순위: Gemini → Claude → 규칙 기반(키 불필요)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-haiku-4-5-20251001"

    # Judge0 엔드포인트
    JUDGE0_URL: str = os.getenv("JUDGE0_URL", "http://judge0-server:2358")

    # CORS 설정 (쉼표 구분)
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app"
    )

    # 실행 제한 정책
    DEFAULT_TIMEOUT_SECONDS: float = float(os.getenv("DEFAULT_TIMEOUT_SECONDS", "5.0"))
    MAX_TIMEOUT_SECONDS: float = float(os.getenv("MAX_TIMEOUT_SECONDS", "10.0"))
    DEFAULT_MEMORY_LIMIT_KB: int = int(os.getenv("DEFAULT_MEMORY_LIMIT_KB", "524288"))  # 512MB

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()
