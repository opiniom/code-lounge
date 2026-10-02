import sys
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from config import settings
from database import init_db, get_db
from models import User, Submission
from schemas import CodeRunRequest, CodeRunResponse, HealthCheckResponse
from services.judge0_client import judge0_client, LANGUAGE_MAP
from services.sandbox_runner import local_sandbox_runner
from services.auth_service import get_current_user_optional
from routers.auth import router as auth_router
from routers.submissions import router as submissions_router
from routers.projects import router as projects_router
from routers.calendar import router as calendar_router

# 실시간 웹소켓 연결 매니저 (Supabase Realtime 완벽 대체)
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

ws_manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 기동 시 DB 초기화 및 테이블 자동 생성"""
    await init_db()
    yield

app = FastAPI(
    title="Code Execution & Auth Backend API",
    description="개인 PC 자체 데이터베이스, JWT 인증, 안전한 코드 실행 샌드박스를 제공하는 올인원 백엔드",
    version="2.0.0",
    lifespan=lifespan
)

import os
from fastapi.responses import FileResponse

# CORS 설정 (모든 로컬 개발 환경 및 Vercel, Cloudflare Tunnel 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth_router)
app.include_router(submissions_router)
app.include_router(projects_router)
app.include_router(calendar_router)

# 프론트엔드 UI 직접 서빙 (/ui 및 /app)
DEFAULT_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "code_lounge_ui"))
UI_DIR = settings.FRONTEND_DIR if (settings.FRONTEND_DIR and os.path.exists(settings.FRONTEND_DIR)) else DEFAULT_UI_DIR
INDEX_FILE = os.path.join(UI_DIR, "index.html")

@app.get("/ui", tags=["UI"])
@app.get("/app", tags=["UI"])
async def serve_ui():
    if os.path.exists(INDEX_FILE):
        return FileResponse(INDEX_FILE)
    return {"error": "UI index.html 파일을 찾을 수 없습니다."}


@app.get("/", tags=["General"])
async def root():
    return {
        "message": "자체 DB 및 JWT 인증이 탑재된 코드 실행 백엔드 API가 정상 가동 중입니다.",
        "docs_url": "/docs",
        "health_url": "/health",
        "auth_urls": {
            "signup": "/api/auth/signup",
            "login": "/api/auth/login",
            "me": "/api/auth/me"
        },
        "run_url": "/api/run",
        "submissions_url": "/api/submissions",
        "websocket_url": "/ws/events"
    }

@app.get("/health", response_model=HealthCheckResponse, tags=["Health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """서버 상태, 자체 데이터베이스, 샌드박스 엔진 통합 상태 점검"""
    # 1. DB 연결 점검
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected (SQLite c:/backend/data/app.db)"
    except Exception as e:
        db_status = f"error ({str(e)})"

    # 2. 샌드박스 엔진 점검
    is_judge0_healthy, version_info = await judge0_client.check_health()
    if is_judge0_healthy:
        engine_desc = f"Judge0 CE ({version_info})"
        supported_langs = list(LANGUAGE_MAP.keys())
    else:
        engine_desc = "Local Isolated Sandbox (Python 3.11 + OpenJDK 17 Hotspot)"
        supported_langs = local_sandbox_runner.get_supported_languages()

    return HealthCheckResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat() + "Z",
        database_status=db_status,
        judge0_status=engine_desc,
        judge0_version=version_info if is_judge0_healthy else "2.0.0 (Local Sandbox)",
        supported_languages=supported_langs
    )

@app.post("/api/run", response_model=CodeRunResponse, tags=["Code Execution"])
async def execute_code(
    request: CodeRunRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    소스 코드를 받아 격리된 샌드박스에서 실행합니다.
    인증 토큰(Bearer Token)이 동봉된 경우 결과가 DB에 자동 저장됩니다.
    """
    # 1. 샌드박스 실행 (Judge0 또는 로컬 샌드박스)
    is_judge0_healthy, _ = await judge0_client.check_health()
    if is_judge0_healthy:
        response = await judge0_client.run_code(
            source_code=request.source_code,
            language=request.language,
            stdin=request.stdin or "",
            cpu_time_limit=request.cpu_time_limit,
            memory_limit=request.memory_limit
        )
    else:
        response = await local_sandbox_runner.execute(
            source_code=request.source_code,
            language=request.language,
            stdin=request.stdin or "",
            cpu_time_limit=request.cpu_time_limit,
            memory_limit=request.memory_limit
        )

    # 2. 로그인된 사용자인 경우 DB에 실행 히스토리 영속화
    if current_user:
        submission = Submission(
            user_id=current_user.id,
            language=request.language,
            source_code=request.source_code,
            stdin=request.stdin or "",
            stdout=response.stdout,
            stderr=response.stderr,
            compile_output=response.compile_output,
            status=response.status,
            execution_time=response.execution_time,
            memory_used=response.memory_used,
            exit_code=response.exit_code
        )
        db.add(submission)
        await db.commit()
        await db.refresh(submission)
        response.submission_id = submission.id

    # 3. 실시간 웹소켓 이벤트 브로드캐스트
    await ws_manager.broadcast({
        "event": "code_executed",
        "user_id": current_user.id if current_user else None,
        "language": request.language,
        "status": response.status,
        "execution_time": response.execution_time,
        "submission_id": response.submission_id
    })

    return response

@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    """실시간 실행 상태 및 이벤트 수신용 웹소켓 엔드포인트"""
    await ws_manager.connect(websocket)
    try:
        while True:
            # 클라이언트 핑-퐁 유지
            data = await websocket.receive_text()
            await websocket.send_json({"event": "pong", "data": data})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
