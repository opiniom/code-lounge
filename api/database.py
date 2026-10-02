import os
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from config import settings

# SQLite 파일 저장 디렉터리 보장 (DATABASE_URL 기준, OS 무관)
if settings.DATABASE_URL.startswith("sqlite"):
    _db_file = make_url(settings.DATABASE_URL).database
    if _db_file and _db_file != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(_db_file)), exist_ok=True)

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

def _migrate_users_table(sync_conn):
    """예전 스키마(oauth 컬럼 없음, hashed_password NOT NULL)의 users 테이블을 현재 모델로 재구성"""
    from sqlalchemy import text
    info = {row[1]: row for row in sync_conn.execute(text("PRAGMA table_info(users)"))}
    if not info:
        return
    if "oauth_provider" in info and info["hashed_password"][3] == 0:
        return
    new_table = Base.metadata.tables["users"]
    keep = [c.name for c in new_table.columns if c.name in info]
    sync_conn.execute(text("PRAGMA legacy_alter_table=ON"))   # 다른 테이블의 FK 가 users_old 로 바뀌지 않게
    sync_conn.execute(text("ALTER TABLE users RENAME TO users_old"))
    sync_conn.execute(text("PRAGMA legacy_alter_table=OFF"))
    for (idx_name,) in list(sync_conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users_old' AND sql IS NOT NULL"))):
        sync_conn.execute(text('DROP INDEX IF EXISTS "%s"' % idx_name))
    new_table.create(sync_conn)
    cols = ", ".join('"%s"' % c for c in keep)
    sync_conn.execute(text('INSERT INTO users (%s) SELECT %s FROM users_old' % (cols, cols)))
    sync_conn.execute(text("DROP TABLE users_old"))

def _add_missing_columns(sync_conn):
    """이미 만들어진 SQLite 파일에 나중에 추가된 컬럼을 보충 (create_all 은 기존 테이블을 바꾸지 않음)"""
    from sqlalchemy import text
    cols = {row[1] for row in sync_conn.execute(text("PRAGMA table_info(meeting_docs)"))}
    if cols and "project_id" not in cols:
        sync_conn.execute(text("ALTER TABLE meeting_docs ADD COLUMN project_id INTEGER"))
    if cols and "detections" not in cols:
        sync_conn.execute(text("ALTER TABLE meeting_docs ADD COLUMN detections TEXT"))
    ev_cols = {row[1] for row in sync_conn.execute(text("PRAGMA table_info(calendar_events)"))}
    if ev_cols and "meeting_doc_id" not in ev_cols:
        sync_conn.execute(text("ALTER TABLE calendar_events ADD COLUMN meeting_doc_id INTEGER"))

async def init_db():
    """서버 시작 시 데이터베이스 및 테이블 자동 생성"""
    async with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            await conn.run_sync(_migrate_users_table)
        await conn.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "sqlite":
            await conn.run_sync(_add_missing_columns)
