"""'나만 보는 AI 대화' 테스트 — 임시 DB·임시 포트(8091)로 서버를 직접 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_ai_private_chat.py (프로젝트 루트에서)
핵심: 내가 AI 와 나눈 대화가 ① 팀 채팅 목록 ② 팀원의 AI 대화 목록 ③ 실시간 알림 ④ 일정 감지/AI 자료 어디로도 새지 않는다."""
import asyncio, json, os, sqlite3, subprocess, sys, time, datetime, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_aichat.db"); PORT = 8091
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
import websockets
env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false", GEMINI_API_KEY="", GOOGLE_API_KEY="", OPENAI_API_KEY="")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
for i, e in ((1, "a@example.com"), (2, "b@example.com"), (3, "out@example.com")):
    c.execute("insert into users (id,email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,?,1,?)", (i, e, "", f"u{i}", "google", now))
c.commit()
T = {i: create_access_token({"sub": str(i), "email": f"{n}@example.com"}) for i, n in ((1, "a"), (2, "b"), (3, "out"))}
def api(method, path, uid, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer " + T[uid], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code, None
st, proj = api("POST", "/api/projects", 1, {"title": "p"}); PID = proj["id"]
c.execute("insert into project_members (project_id,user_id,role,created_at) values (?,?,?,?)", (PID, 2, "member", now)); c.commit()
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
M = f"/api/projects/{PID}/messages"
def wait_ai(uid, n, scope="ai", t=20):
    end = time.time() + t
    while time.time() < end:
        st, rows = api("GET", f"{M}?scope={scope}", uid)
        if sum(1 for r in rows if r["kind"] == "ai") >= n: return rows
        time.sleep(0.4)
    return api("GET", f"{M}?scope={scope}", uid)[1]

async def main():
    events = {1: [], 2: []}
    async def listen(uid):
        async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws/live?token={T[uid]}") as ws:
            try:
                while True: events[uid].append(json.loads(await ws.recv()))
            except Exception: pass
    tasks = [asyncio.ensure_future(listen(u)) for u in (1, 2)]; await asyncio.sleep(1.0)

    st, m = api("POST", M, 1, {"text": "내일 오후 3시까지 보고서 마무리할게 (개인 메모)", "private": True})
    chk("나만 보는 메시지 보내기 → private 표시", st == 201 and m["private"] is True, (st, m))
    rows_a = wait_ai(1, 1)
    chk("AI 가 이름을 부르지 않아도 나에게 답한다 (내 개인 대화에 AI 답변이 생김)", any(r["kind"] == "ai" for r in rows_a) and all(r["private"] for r in rows_a), [(r["kind"], r["private"]) for r in rows_a])
    chk("내 개인 대화에는 내 질문과 AI 답변이 순서대로 보인다", [r["kind"] for r in rows_a][:2] == ["user", "ai"], [r["kind"] for r in rows_a])
    st, team_a = api("GET", M, 1)
    chk("팀 채팅 목록(나)에는 개인 대화가 섞이지 않는다", all(not r["private"] for r in team_a) and not any("개인 메모" in r["text"] for r in team_a), team_a)
    st, team_b = api("GET", M, 2)
    chk("팀원은 팀 채팅 목록에서 내 개인 대화를 볼 수 없다", not any("개인 메모" in r["text"] for r in team_b) and len(team_b) == 0, team_b)
    st, ai_b = api("GET", f"{M}?scope=ai", 2)
    chk("팀원이 개인 대화 목록(scope=ai)을 열어도 내 대화는 없다 (자기 것만 나온다)", st == 200 and ai_b == [], ai_b)
    st, _ = api("GET", f"{M}?scope=ai", 3)
    chk("프로젝트 밖 사람은 어느 쪽도 볼 수 없다", st in (403, 404), st)
    # 실시간 알림 누수
    await asyncio.sleep(0.8)
    types_b = [e.get("t") for e in events[2]]; types_a = [e.get("t") for e in events[1]]
    chk("실시간: 나에게는 개인 대화 신호(aichat)가 온다", "aichat" in types_a, types_a)
    chk("실시간: 팀원에게는 chat/aichat 어떤 신호도 가지 않는다(대화가 있었다는 사실도 숨김)", "chat" not in types_b and "aichat" not in types_b, types_b)
    # 팀 메시지는 정상적으로 팀원에게 간다
    api("POST", M, 1, {"text": "팀 공지: 내일 회의 있어요"}); await asyncio.sleep(0.8)
    st, team_b = api("GET", M, 2)
    chk("일반 팀 메시지는 팀원에게 보이고 신호도 간다", any("팀 공지" in r["text"] for r in team_b) and "chat" in [e.get("t") for e in events[2]], [e.get("t") for e in events[2]])
    st, ai_a = api("GET", f"{M}?scope=ai", 1)
    chk("팀 메시지는 내 개인 대화에 들어오지 않는다", not any("팀 공지" in r["text"] for r in ai_a))
    # 일정 감지(자동 AI 카드)는 개인 대화로 만들어지지 않는다
    time.sleep(1.5)
    n_detect = c_count("select count(*) from chat_messages where kind='ai_detect' and private_to is not null")
    chk("개인 대화로는 '일정 감지 카드'가 만들어지지 않는다", n_detect == 0, n_detect)
    # 되돌리기/확인 API: 남의 개인 AI 메시지는 존재도 모른다
    ai_msg = next(r for r in rows_a if r["kind"] == "ai")
    st, _ = api("POST", f"{M}/{ai_msg['id']}/undo/0", 2)
    chk("팀원이 내 개인 AI 메시지에 되돌리기/확인을 시도하면 404 (존재 자체를 숨김)", st == 404, st)
    # 지우기: 내 것만
    api("POST", M, 2, {"text": "나는 B 의 개인 대화", "private": True}); wait_ai(2, 1)
    st, _ = api("DELETE", f"{M}/private", 1)
    chk("'내 AI 대화 지우기'는 204", st == 204, st)
    chk("지우면 내 개인 대화만 사라지고 팀원의 개인 대화는 남는다", api("GET", f"{M}?scope=ai", 1)[1] == [] and len(api("GET", f"{M}?scope=ai", 2)[1]) >= 1)
    chk("팀 채팅은 지워지지 않는다", any("팀 공지" in r["text"] for r in api("GET", M, 2)[1]))
    for t in tasks: t.cancel()

    # AI 에게 주는 참고 자료에 남의 개인 대화가 섞이지 않는다 (AI 답변을 통해 새는 길을 막는다)
    now_ = datetime.datetime.utcnow().isoformat(sep=" ")
    cc = sqlite3.connect(DB)
    for uid, kind, txt, pv in ((1, "user", "TEAM_VISIBLE 팀원 모두 보는 말", None), (1, "user", "A_SECRET 에이의 개인 질문", 1), (None, "ai", "A_SECRET_AI 에이에게 한 답", 1),
                               (2, "user", "B_SECRET 비의 개인 질문", 2)):
        cc.execute("insert into chat_messages (project_id,user_id,kind,text,private_to,created_at) values (?,?,?,?,?,?)", (PID, uid, kind, txt, pv, now_))
    cc.commit(); cc.close()
    snippet = (
        "import asyncio, sys; sys.path.insert(0,'.')\n"
        "from datetime import date\n"
        "from sqlalchemy import select\n"
        "from database import async_session_maker\n"
        "from models import Project\n"
        "from services import chat_ai\n"
        "async def go():\n"
        "    async with async_session_maker() as db:\n"
        f"        p = (await db.execute(select(Project).where(Project.id=={PID}))).scalar_one()\n"
        "        team = await chat_ai._build_context(db, p, 2, date.today(), None, False)\n"
        "        priv = await chat_ai._build_context(db, p, 2, date.today(), None, True)\n"
        "        print(repr((team, priv)))\n"
        "asyncio.run(go())\n")
    out = subprocess.run([sys.executable, "-c", snippet], cwd=os.path.join(ROOT, "api"), env=env, capture_output=True, text=True, timeout=60)
    team_ctx, priv_ctx = eval(out.stdout.strip().splitlines()[-1]) if out.stdout.strip() else ("", "")
    chk("AI 자료(팀 대화로 부를 때): 팀 대화는 들어가고 누구의 개인 대화도 들어가지 않는다", "TEAM_VISIBLE" in team_ctx and "A_SECRET" not in team_ctx and "B_SECRET" not in team_ctx, out.stderr[-300:] or team_ctx[-200:])
    chk("AI 자료(비가 개인 대화로 부를 때): 비 자신의 개인 대화는 들어가고 에이의 개인 대화는 절대 들어가지 않는다", "B_SECRET" in priv_ctx and "A_SECRET" not in priv_ctx, priv_ctx[-300:])
def c_count(q): return sqlite3.connect(DB).execute(q).fetchone()[0]
try:
    asyncio.run(main())
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
