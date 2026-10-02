import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from config import settings

# SQLite 파일 저장 디렉터리 보장
db_dir = os.path.dirname(r"c:\backend\data\app.db")
os.makedirs(db_dir, exist_ok=True)

# 비동기 엔진 생성
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True
)

# 세션 팩토리
async_session_maker = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    """FastAPI 경로 종속성 주입용 DB 세션 제너레이터"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    """서버 시작 시 데이터베이스 및 테이블 자동 생성"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
