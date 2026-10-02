import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 데이터베이스 설정 (기본: 로컬 비동기 SQLite 파일, 추후 PostgreSQL로 교체 가능)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite+aiosqlite:///c:/backend/data/app.db"
    )

    # JWT 인증 설정
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY", 
        "your-super-secret-jwt-key-for-local-development-change-in-prod-987654321"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24시간
    
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
