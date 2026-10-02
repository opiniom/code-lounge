import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # JWT 인증 설정
    JWT_SECRET_KEY: str = "your-super-secret-jwt-key-for-local-development-change-in-prod-987654321"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24시간
    
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
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-haiku-4-5-20251001"
    
    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()
