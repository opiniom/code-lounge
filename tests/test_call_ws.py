"""통화방 신호 서버(/ws/call) 통합 테스트 — 임시 DB·임시 포트(8094)로 서버를 직접 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_call_ws.py (프로젝트 루트에서)
확인: 로그인·팀원 확인 · ping→pong(연결 유지 확인) · 입장/퇴장 알림 · 끊긴 사람이 다시 들어올 때 옛 연결 정리(재연결) · 시그널 중계는 같은 방 사람에게만"""
import asyncio, json, os, sqlite3, subprocess, sys, time, datetime, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_call_ws.db"); PORT = 8094
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
import websockets
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"),
                       env=dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
USERS = ((1, "a@example.com"), (2, "b@example.com"), (3, "out@example.com"))
for i, e in USERS:
    c.execute("insert into users (id,email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,?,1,?)", (i, e, "", f"u{i}", "google", now))
c.commit()
T = {i: create_access_token({"sub": str(i), "email": e}) for i, e in USERS}
def api(method, path, tok, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r: raw = r.read(); return r.status, json.loads(raw) if raw else None
st, proj = api("POST", "/api/projects", T[1], {"title": "callproj"}); PID = proj["id"]
c.execute("insert into project_members (project_id,user_id,role,created_at) values (?,?,?,?)", (PID, 2, "member", now)); c.commit()
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
URL = f"ws://127.0.0.1:{PORT}/ws/call/{PID}/main"
async def join(uid, room="main", token=None):
    ws = await websockets.connect(f"ws://127.0.0.1:{PORT}/ws/call/{PID}/{room}")
    await ws.send(json.dumps({"type": "auth", "token": T[uid] if token is None else token}))
    return ws
async def recv(ws, kind=None, timeout=5):
    end = time.time() + timeout
    while time.time() < end:
        try: m = json.loads(await asyncio.wait_for(ws.recv(), max(0.1, end - time.time())))
        except asyncio.TimeoutError: return None
        except websockets.ConnectionClosed: return {"type": "closed"}
        if kind is None or m.get("type") == kind: return m
    return None
async def main():
    # 인증
    ws = await join(1, token="bad"); m = await recv(ws); chk("잘못된 로그인 토큰은 거절", m and m["type"] == "error", m)
    ws = await join(3); m = await recv(ws); chk("팀원이 아닌 사람은 들어올 수 없다", m and m["type"] == "error" and "팀원" in m["message"], m)
    ws = await join(1, room="999"); m = await recv(ws); chk("없는 방은 안내하고 끝낸다", m and m["type"] == "error" and "찾을 수 없" in m["message"], m)
    # 입장
    a = await join(1); wa = await recv(a, "welcome"); chk("입장하면 welcome(내 번호·방 사람들)을 받는다", wa and wa["id"] and wa["peers"] == [], wa)
    b = await join(2); wb = await recv(b, "welcome"); pj = await recv(a, "peer-joined")
    chk("두 번째 사람은 기존 참가자 목록을 받고, 기존 사람은 입장 알림을 받는다", wb and len(wb["peers"]) == 1 and wb["peers"][0]["id"] == wa["id"] and pj and pj["peer"]["id"] == wb["id"], (wb, pj))
    # ping → pong (클라이언트가 연결이 살아 있는지 확인하는 용도)
    await a.send(json.dumps({"type": "ping", "t": 123})); m = await recv(a, "pong"); chk("ping 에 pong 으로 답한다 (연결 유지 확인)", m and m["t"] == 123, m)
    # 시그널 중계
    await a.send(json.dumps({"type": "signal", "to": wb["id"], "data": {"sdp": {"type": "offer", "sdp": "x"}}})); m = await recv(b, "signal")
    chk("시그널(SDP/ICE)은 같은 방의 상대에게만 전달된다", m and m["from"] == wa["id"] and m["data"]["sdp"]["type"] == "offer", m)
    # 재연결: a 가 새 연결로 다시 들어오면(옛 연결은 아직 살아 있는 것처럼 보임) 옛 연결을 정리하고 b 에게 알린다
    a2 = await join(1); wa2 = await recv(a2, "welcome")
    k = await recv(a, "kicked"); pl = await recv(b, "peer-left"); pj2 = await recv(b, "peer-joined")
    chk("같은 사람이 다시 들어오면(재연결) 옛 연결은 정리된다 (유령 참가자가 남지 않는다)", k is not None and pl and pl["id"] == wa["id"], (k, pl))
    chk("  ㄴ 새 연결은 새 번호로 들어오고 상대에게 입장 알림이 간다", wa2 and wa2["id"] != wa["id"] and len(wa2["peers"]) == 1 and wa2["peers"][0]["id"] == wb["id"] and pj2 and pj2["peer"]["id"] == wa2["id"], (wa2, pj2))
    # 갑자기 끊김(브라우저 종료·와이파이 끊김) → 상대에게 퇴장 알림
    await a2.close(); m = await recv(b, "peer-left"); chk("연결이 갑자기 끊기면 상대에게 퇴장 알림이 간다", m and m["id"] == wa2["id"], m)
    st, ov = api("GET", f"/api/projects/{PID}/call", T[1]); mine = [p["name"] for r in ov["rooms"] for p in r["participants"]]
    chk("통화방 목록에서도 끊긴 사람은 사라지고 남은 사람만 보인다", mine == ["u2"], mine)
    # 음소거 상태 전달
    await b.send(json.dumps({"type": "state", "muted": True})); a3 = await join(1); w3 = await recv(a3, "welcome")
    chk("음소거 상태는 새로 들어온 사람에게도 전달된다", w3 and w3["peers"] and w3["peers"][0]["muted"] is True, w3)
    for w in (a3, b): await w.close()
try: asyncio.run(main())
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
