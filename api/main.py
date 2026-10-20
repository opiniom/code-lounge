import asyncio
import json
import sys
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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
from routers.meetings import router as meetings_router
from routers.chat import router as chat_router
from routers.files import router as files_router
from routers.invitations import router as invitations_router
from routers.events import router as events_router
from routers.notifications import router as notifications_router
from routers.call import router as call_router
from routers.community import router as community_router, seed_community
from routers.presence import router as presence_router
from routers.profile import router as profile_router, follow_router
from routers.admin import router as admin_router
from routers.account import router as account_router
from routers.terminal import router as terminal_router
from routers.languages import router as languages_router

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
    from services import live as live_hub
    live_hub.install()                                  # 저장되는 순간 화면으로 바로 알려주기 (WebSocket /ws/live)
    from database import async_session_maker
    await seed_community(async_session_maker)          # 커뮤니티가 비어 있으면 이용 안내 글 하나
    # 공모전·해커톤 정보를 서버가 켜져 있는 동안 주기적으로 자동 수집 (EVENT_CRAWL_ENABLED=false 로 끌 수 있음)
    from services.account_service import purge_loop
    purger = asyncio.create_task(purge_loop())          # 탈퇴 기록은 7일 뒤 자동 삭제
    scheduler = None
    if settings.EVENT_CRAWL_ENABLED:
        from services.event_crawler import scheduler_loop
        scheduler = asyncio.create_task(scheduler_loop())
    try:
        yield
    finally:
        purger.cancel()
        if scheduler:
            scheduler.cancel()

app = FastAPI(
    title="Code Execution & Auth Backend API",
    description="개인 PC 자체 데이터베이스, JWT 인증, 안전한 코드 실행 샌드박스를 제공하는 올인원 백엔드",
    version="2.0.0",
    lifespan=lifespan,
    # 외부 공유 모드에서는 API 문서를 숨긴다
    docs_url=None if settings.PUBLIC_MODE else "/docs",
    redoc_url=None if settings.PUBLIC_MODE else "/redoc",
    openapi_url=None if settings.PUBLIC_MODE else "/openapi.json",
)

import os
import re
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

# CORS 설정 (모든 로컬 개발 환경 및 Vercel, Cloudflare Tunnel 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 응답 압축: 화면(index.html)이 크기 때문에, 느린 외부 공유 터널로도 빨리 열리게 한다 (웹소켓에는 영향 없음)
app.add_middleware(GZipMiddleware, minimum_size=1024)

# 라우터 등록
app.include_router(auth_router)
app.include_router(submissions_router)
app.include_router(projects_router)
app.include_router(calendar_router)
app.include_router(meetings_router)
app.include_router(chat_router)
app.include_router(files_router)
app.include_router(invitations_router)
app.include_router(events_router)
app.include_router(notifications_router)
app.include_router(call_router)
app.include_router(community_router)
app.include_router(presence_router)
app.include_router(profile_router)
app.include_router(follow_router)
app.include_router(admin_router)
app.include_router(account_router)
app.include_router(terminal_router)
app.include_router(languages_router)

# 프론트엔드 UI 직접 서빙 (/ui 및 /app)
DEFAULT_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
UI_DIR = settings.FRONTEND_DIR if (settings.FRONTEND_DIR and os.path.exists(settings.FRONTEND_DIR)) else DEFAULT_UI_DIR
INDEX_FILE = os.path.join(UI_DIR, "index.html")

SHARE_URL_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "share_url.txt")

@app.get("/api/share-url", tags=["UI"])
async def share_url():
    """외부 공유 모드(./share.sh)일 때 팀원에게 보낼 공개 주소. 초대 링크를 이 주소로 만든다."""
    url = None
    if settings.PUBLIC_MODE:
        try:
            with open(SHARE_URL_FILE, "r", encoding="utf-8") as f:
                candidate = f.read().strip().rstrip("/")
            if candidate.startswith("https://") and " " not in candidate:
                url = candidate
        except OSError:
            pass
    return {"public_mode": settings.PUBLIC_MODE, "url": url}

_UI_CACHE = {"stamp": None, "build": "none", "html": "", "css": "", "js": ""}

def _ui_manifest():
    """frontend/manifest.json 의 순서대로 css / js 파일 목록을 읽는다"""
    import json
    try:
        with open(os.path.join(UI_DIR, "manifest.json"), "r", encoding="utf-8") as fh:
            m = json.load(fh)
        return list(m.get("css", [])), list(m.get("js", []))
    except (OSError, ValueError):
        return [], []

def _ui_snapshot():
    """화면 파일이 바뀌었는지 확인해서, 바뀌었을 때만 다시 묶는다 (index.html + css/ + js/ → 버전 해시, bundle.css, bundle.js)."""
    import hashlib
    css_files, js_files = _ui_manifest()
    files = [INDEX_FILE, os.path.join(UI_DIR, "manifest.json")] + [os.path.join(UI_DIR, f) for f in css_files + js_files]
    try:
        stamp = tuple((f, os.path.getmtime(f), os.path.getsize(f)) for f in files if os.path.exists(f))
    except OSError:
        return _UI_CACHE
    if stamp != _UI_CACHE["stamp"]:
        def bundle(names, comment):
            out = []
            for n in names:
                try:
                    with open(os.path.join(UI_DIR, n), "r", encoding="utf-8") as fh:
                        out.append("\n%s ===== %s ===== %s\n%s" % (comment[0], n, comment[1], fh.read()))
                except OSError:
                    pass
            return "".join(out)
        css = bundle(css_files, ("/*", "*/"))
        js = bundle(js_files, ("/*", "*/"))
        build = hashlib.sha1((css + js).encode("utf-8")).hexdigest()[:10]
        try:
            with open(INDEX_FILE, "r", encoding="utf-8") as fh:
                raw = fh.read()
            build = hashlib.sha1((build + raw).encode("utf-8")).hexdigest()[:10]
            html = raw.replace("__BUILD__", build)
        except OSError:
            html = ""
        _UI_CACHE.update(stamp=stamp, build=build, html=html, css=css, js=js)
    return _UI_CACHE

@app.get("/api/version", tags=["UI"])
async def app_version():
    """화면 버전. 열어 둔 화면이 오래된 코드인지 확인하는 데 쓴다."""
    return {"build": _ui_snapshot()["build"]}

# 화면 파일: 소스는 frontend/css/*.css, frontend/js/**/*.js 로 나뉘어 있고, 서버가 manifest.json 순서대로 묶어서
# /static/bundle.css, /static/bundle.js 하나씩으로 내려준다. (한 파일이던 때와 똑같이 동작하고, 요청 수는 오히려 줄어든다)
# 주소의 ?v= 값이 바뀌면 브라우저가 새로 받는다.
@app.get("/static/bundle.css", include_in_schema=False)
async def bundle_css():
    return Response(_ui_snapshot()["css"], media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=31536000, immutable"})

@app.get("/static/bundle.js", include_in_schema=False)
async def bundle_js():
    return Response(_ui_snapshot()["js"], media_type="application/javascript; charset=utf-8", headers={"Cache-Control": "public, max-age=31536000, immutable"})

# ---------------- PWA (앱으로 설치) ----------------
# 매니페스트는 사용자가 쓰는 화면 모드(라이트/다크)에 맞는 아이콘·색으로 내려준다: /manifest.webmanifest?theme=dark
# (설치하는 순간의 아이콘이 홈 화면 아이콘이 되므로, 화면이 테마가 바뀔 때마다 이 주소의 theme 값을 바꿔 둔다)
def _pwa_manifest(theme: str) -> dict:
    t = "dark" if theme == "dark" else "light"
    icon = lambda n, purpose="any", fmt="icon-%s-%d": {"src": "/static/icons/" + (fmt % (t, n)) + ".png", "sizes": "%dx%d" % (n, n), "type": "image/png", "purpose": purpose}
    shortcut = lambda name, url: {"name": name, "short_name": name, "url": url, "icons": [{"src": "/static/icons/icon-%s-96.png" % t, "sizes": "96x96", "type": "image/png"}]}
    return {
        "id": "/app",
        "name": "DureSync (두레싱크)",
        "short_name": "DureSync",
        "description": "팀 프로젝트를 위한 AI 워크스페이스 — 채팅·통화·일정·회의록·코드를 한곳에서",
        "lang": "ko", "dir": "ltr",
        "start_url": "/app?source=pwa",
        "scope": "/",
        "display": "standalone",
        "display_override": ["standalone", "minimal-ui"],
        "orientation": "any",
        "background_color": "#0A0F1F" if t == "dark" else "#F5F7FC",
        "theme_color": "#111731" if t == "dark" else "#FFFFFF",
        "categories": ["productivity", "business", "education"],
        "prefer_related_applications": False,
        "icons": [icon(n) for n in (48, 96, 144, 192, 256, 384, 512)]
                 + [{"src": "/static/icons/maskable-%s-%d.png" % (t, n), "sizes": "%dx%d" % (n, n), "type": "image/png", "purpose": "maskable"} for n in (192, 512)]
                 + [{"src": "/static/icons/monochrome-%d.png" % n, "sizes": "%dx%d" % (n, n), "type": "image/png", "purpose": "monochrome"} for n in (192, 512)],
        "shortcuts": [shortcut("워크스페이스", "/app/workspace?source=shortcut"), shortcut("회의록", "/app/meetings?source=shortcut"),
                      shortcut("캘린더", "/app/calendar?source=shortcut"), shortcut("커뮤니티", "/app/community?source=shortcut")],
    }

@app.get("/manifest.webmanifest", include_in_schema=False)
async def pwa_manifest(theme: str = "light"):
    return JSONResponse(_pwa_manifest(theme), media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=600"})

@app.get("/sw.js", include_in_schema=False)
async def pwa_service_worker():
    """서비스 워커: 항상 최신을 확인하게(no-cache) 하고, 화면 버전을 넣어서 내려준다. 전체 사이트(/)를 관리할 수 있게 허용."""
    try:
        with open(os.path.join(UI_DIR, "sw.js"), "r", encoding="utf-8") as fh:
            body = fh.read().replace("__BUILD__", _ui_snapshot()["build"])
    except OSError:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(body, media_type="application/javascript; charset=utf-8", headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})

class _IconStatic(StaticFiles):
    """아이콘은 거의 안 바뀌므로 하루 동안 다시 묻지 않고 쓰게 한다 (이름에 버전이 없어서 너무 길게 잡지는 않는다)"""
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if resp.status_code == 200:
            resp.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
        return resp

_ICON_DIR = os.path.join(UI_DIR, "icons")
if os.path.isdir(_ICON_DIR):
    app.mount("/static/icons", _IconStatic(directory=_ICON_DIR), name="pwa-icons")      # /static 마운트보다 먼저 (더 구체적인 주소가 먼저 잡히게)

if os.path.isdir(UI_DIR):
    app.mount("/static", StaticFiles(directory=UI_DIR), name="ui-static")

# 화면 주소: /app, /app/login, /app/workspace, /app/community/12 … 모두 같은 index.html 이 열리고,
# 어떤 화면을 보여줄지는 화면(JS)이 주소를 보고 정한다. (/ 와 /ui 는 예전 주소)
# ---- 내 PC 러너: 웹사이트가 사용자에게 내려주는 작은 프로그램 (내 컴퓨터에 설치한 언어로 코드를 실행)
_RUNNER_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "runner", "duresync_runner.py")


def _runner_origins(request: Request) -> list:
    """러너가 믿을 웹사이트 주소: 설정된 공개 주소(PUBLIC_BASE_URL). 개발용 localhost 로 접속했을 때만 지금 접속한 주소도 믿는다 (운영 서버는 https 주소만)"""
    out = []
    base = (settings.PUBLIC_BASE_URL or "").strip().rstrip("/")
    if base:
        out.append(base)
    host = (request.headers.get("host") or "").split(":")[0]
    if host in ("localhost", "127.0.0.1"):
        o = f"{request.url.scheme}://{request.headers.get('host')}"
        if o not in out:
            out.append(o)
    return out


@app.get("/api/runner", tags=["Runner"])
async def runner_info():
    """러너 프로그램의 최신 버전과 내려받는 주소 (화면이 '새 버전이 있어요' 안내에 쓴다)"""
    ver = None
    try:
        with open(_RUNNER_FILE, "r", encoding="utf-8") as fh:
            m = re.search(r'^RUNNER_VERSION = "([^"]+)"', fh.read(), re.M)
            ver = m.group(1) if m else None
    except OSError:
        pass
    return {"version": ver, "download": "/runner/duresync_runner.py", "port": 47321, "available": ver is not None}


@app.get("/runner/duresync_runner.py", tags=["Runner"], include_in_schema=False)
async def runner_download(request: Request):
    try:
        with open(_RUNNER_FILE, "r", encoding="utf-8") as fh:
            body = fh.read()
    except OSError:
        raise HTTPException(status_code=404, detail="러너 파일을 찾을 수 없어요.")
    origins = _runner_origins(request)
    body = body.replace('ALLOWED_ORIGINS = ["__DURESYNC_ORIGIN__"]', "ALLOWED_ORIGINS = %s" % json.dumps(origins), 1)
    return Response(body, media_type="text/x-python; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="duresync_runner.py"', "Cache-Control": "no-cache"})


@app.get("/", tags=["UI"], include_in_schema=False)
@app.get("/ui", tags=["UI"], include_in_schema=False)
@app.get("/app", tags=["UI"], include_in_schema=False)
@app.get("/app/{page:path}", tags=["UI"], include_in_schema=False)
async def serve_ui(request: Request, page: str = ""):
    if "." in page.rsplit("/", 1)[-1]:      # /app/없는파일.js 같은 요청은 화면이 아니라 404
        raise HTTPException(status_code=404, detail="Not found")
    snap = _ui_snapshot()
    if snap["html"]:
        etag = '"%s"' % snap.get("build", "")
        if snap.get("build") and request.headers.get("if-none-match") == etag:      # 화면이 안 바뀌었으면 92KB 를 다시 보내지 않는다
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "no-cache"})
        return HTMLResponse(snap["html"], headers={"Cache-Control": "no-cache", "ETag": etag})
    return {"error": "UI index.html 파일을 찾을 수 없습니다."}


@app.get("/api", tags=["General"])
async def root():
    return {
        "message": "자체 DB 및 JWT 인증이 탑재된 코드 실행 백엔드 API가 정상 가동 중입니다.",
        "docs_url": "/docs",
        "health_url": "/health",
        "auth_urls": {
            "login": "/api/auth/login",
            "me": "/api/auth/me",
            "google_login": "/api/auth/google/login",
            "naver_login": "/api/auth/naver/login"
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
        engine_desc = "Local Sandbox (" + ", ".join(local_sandbox_runner.get_supported_languages()) + ")"
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
    # 외부 공유 모드: 로컬 샌드박스는 서버를 연 사람의 컴퓨터에서 직접 실행되므로 끈다
    if settings.PUBLIC_MODE:
        raise HTTPException(
            status_code=403,
            detail="공유 모드에서는 보안을 위해 코드 실행이 꺼져 있어요. 코드 실행은 서버를 연 사람의 컴퓨터에서만 쓸 수 있어요.",
        )
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
            memory_limit=request.memory_limit,
            runtime_version=request.runtime_version,
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

@app.websocket("/ws/live")
async def live_socket(websocket: WebSocket):
    """로그인한 사용자 화면으로 실시간 변경(알림·채팅·일정·회의록·팀원 상태)을 밀어준다. 주소: /ws/live?token=JWT"""
    from sqlalchemy import select
    from database import async_session_maker
    from models import User
    from services.auth_service import decode_access_token
    from services import live, livedoc
    payload = decode_access_token(websocket.query_params.get("token", "") or "")
    uid = int(payload["sub"]) if payload and str(payload.get("sub", "")).isdigit() else None
    user = None
    if uid:
        async with async_session_maker() as db:
            user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user or not user.is_active:
        await websocket.close(code=4401)
        return
    became_online = await live.hub.connect(uid, websocket)
    if became_online:
        async with async_session_maker() as db:
            u = (await db.execute(select(User).where(User.id == uid))).scalar_one()
            u.last_seen_at = datetime.utcnow()
            await db.commit()
            await live.publish_presence(db, uid)
    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
            elif msg.startswith("{") and (len(msg) < 700 or (len(msg) < 600_000 and msg[:12] == '{"t":"doc","')):
                try:
                    d = json.loads(msg)
                except ValueError:
                    continue
                if d.get("t") == "doc":
                    await livedoc.handle(websocket, user, d)
                elif d.get("t") == "typing" and isinstance(d.get("project_id"), int):
                    await live.relay_typing(user, d["project_id"], bool(d.get("on", True)))
                elif d.get("t") == "ws" and isinstance(d.get("project_id"), int):
                    p_ = d.get("path")
                    await live.relay_ws_presence(user, d["project_id"], p_ if isinstance(p_, str) else None, bool(d.get("editing")),
                                                 d.get("cur") if isinstance(d.get("cur"), dict) else None, bool(d.get("snap")))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await livedoc.leave(websocket)
        if live.hub.disconnect(uid, websocket):
            live.hub.schedule_offline(uid)
            await live.clear_ws_presence(uid, user.username)


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
