"""글자 단위 실시간 공동 편집(/ws/live 의 doc 메시지) 통합 테스트 — 임시 DB·임시 포트(8096)로 서버를 직접 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_livedoc_ws.py (프로젝트 루트에서)"""
import asyncio, json, os, random, sqlite3, subprocess, sys, time, datetime, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_livedoc.db"); PORT = 8096
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services import ot
from services.auth_service import create_access_token
import websockets
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"),
                       env=dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
for i, e in ((1, "a@example.com"), (2, "b@example.com"), (3, "c@example.com"), (4, "out@example.com")):
    c.execute("insert into users (id,email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,?,1,?)", (i, e, "", f"u{i}", "google", now))
c.commit()
T = {i: create_access_token({"sub": str(i), "email": e}) for i, e in ((1, "a@example.com"), (2, "b@example.com"), (3, "c@example.com"), (4, "out@example.com"))}
def api(method, path, tok, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r: raw = r.read(); return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e: return e.code, None
st, proj = api("POST", "/api/projects", T[1], {"title": "live"}); PID = proj["id"]
for uid in (2, 3): c.execute("insert into project_members (project_id,user_id,role,created_at) values (?,?,?,?)", (PID, uid, "member", now))
c.commit()
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
def db_text(path):
    return sqlite3.connect(DB).execute("select content from project_files where project_id=? and path=?", (PID, path)).fetchone()[0]

class Cl:
    """실제 화면과 같은 방식의 접속자: 내 편집은 하나씩 보내고(infl), 그 사이 입력은 모아 두고(buf), 남의 편집은 변환해서 적용"""
    def __init__(s, uid, name): s.uid, s.name, s.cid, s.doc, s.rev, s.infl, s.buf, s.saved, s.crcs, s.ws = uid, name, f"{name}{random.randint(0,9999)}", None, 0, None, [], [], [], None
    async def open(s):
        s.ws = await websockets.connect(f"ws://127.0.0.1:{PORT}/ws/live?token={T[s.uid]}", max_size=8_000_000); s.task = asyncio.ensure_future(s.pump()); s.events = []
    async def join(s, path):
        s.path = path; s.joined = asyncio.get_event_loop().create_future()
        await s.ws.send(json.dumps({"t": "doc", "a": "join", "project_id": PID, "path": path, "cid": s.cid})); return await asyncio.wait_for(s.joined, 5)
    async def pump(s):
        try:
            async for raw in s.ws:
                if raw == "pong": continue
                m = json.loads(raw); s.events.append(m); t = m.get("t")
                if t == "docsync":
                    s.doc = ot.to_buf(m["text"]); s.rev = m["rev"]; s.infl = None; s.buf = []
                    if not s.joined.done(): s.joined.set_result(m)
                elif t == "docerr" and not s.joined.done(): s.joined.set_result(m)
                elif t == "docop":
                    if m["cid"] == s.cid: s.rev = m["rev"]; s.infl = None; await s.flush()
                    else:
                        ops = [tuple(o) for o in m["ops"]]; R1, ni = ot.xform_lists(ops, s.infl or [], True); s.infl = ni if s.infl is not None else None
                        R2, s.buf = ot.xform_lists(R1, s.buf, True); assert ot.apply_ops(s.doc, R2); s.rev = m["rev"]
                    if m.get("crc") is not None: s.crcs.append((m["rev"], m["crc"], bool(s.infl or s.buf)))
                elif t == "docsaved": s.saved.append(m)
        except Exception as e:
            s.events.append({"t": "_pump_error", "e": repr(e)})
    async def flush(s):
        if s.infl is None and s.buf:
            s.infl, s.buf = s.buf, []; await s.ws.send(json.dumps({"t": "doc", "a": "op", "project_id": PID, "path": s.path, "rev": s.rev, "cid": s.cid, "ops": [list(o) for o in s.infl]}, separators=(",", ":")))
    async def type(s, ops):
        assert ot.apply_ops(s.doc, ops); s.buf += ops; await s.flush()
    def text(s): return ot.buf_text(s.doc)
    async def close(s):
        try: await s.ws.close()
        except Exception: pass

async def settle(clients, sec=2.5):
    end = time.time() + sec
    while time.time() < end:
        await asyncio.sleep(0.1)
        if all(not (x.infl or x.buf) for x in clients) and time.time() > end - sec + 0.6: pass

async def main():
    st, _ = api("PUT", f"/api/projects/{PID}/files", T[1], {"path": "src/Main.java", "content": "hello\r\nworld\n", "force": True}); chk("테스트 파일 만들기", st == 200)
    a, b, cc, out = Cl(1, "a"), Cl(2, "b"), Cl(3, "c"), Cl(4, "out")
    for x in (a, b, cc, out): await x.open()
    m = await out.join("src/Main.java"); chk("프로젝트 팀원이 아니면 들어갈 수 없다", m.get("t") == "docerr" and m.get("why") == "forbidden", m)
    m = await a.join("src/none.txt"); chk("없는 파일은 방을 만들지 않는다", m.get("t") == "docerr" and m.get("why") == "missing", m)
    m = await a.join("src/Main.java"); chk("들어가면 현재 내용을 받는다(줄바꿈은 LF 로 통일)", m["text"] == "hello\nworld\n" and m["rev"] == 0, m)
    await b.join("src/Main.java"); await cc.join("src/Main.java")
    # 글자 하나씩 입력 → 다른 사람 화면에 바로
    await a.type([(0, 5, "!")]); await asyncio.sleep(0.3)
    chk("한 사람이 입력하면 저장·Enter 없이 바로 다른 화면에 나타난다", b.text() == "hello!\nworld\n" and cc.text() == "hello!\nworld\n", (b.text(), cc.text()))
    t0 = time.time(); await b.type([(0, 0, "X")])
    while a.text()[:1] != "X" and time.time() - t0 < 2: await asyncio.sleep(0.005)
    lat = (time.time() - t0) * 1000; chk(f"전달 속도: 입력 → 다른 화면 {lat:.0f}ms (같은 컴퓨터 기준 50ms 이내)", lat < 50, lat)
    # 동시에 같은 곳을 고친다
    await asyncio.gather(a.type([(0, 0, "A")]), b.type([(0, 0, "B")]), cc.type([(1, 0, 3)]))
    await asyncio.sleep(0.6)
    chk("동시에 같은 곳을 고쳐도 모두 같은 문서가 된다", a.text() == b.text() == cc.text(), (a.text(), b.text(), cc.text()))
    # 무작위 폭주
    r = random.Random(5)
    async def storm(x, n):
        for _ in range(n):
            L = len(x.doc) // 2
            if L > 0 and r.random() < 0.4:
                p = r.randint(0, L - 1); ops = [(1, p, r.randint(1, min(3, L - p)))]
            else: ops = [(0, r.randint(0, L), r.choice(["a", "한", "😀", "xyz", "\n"]))]
            await x.type(ops); await asyncio.sleep(r.random() * 0.02)
    await asyncio.gather(storm(a, 120), storm(b, 120), storm(cc, 120)); await asyncio.sleep(1.5)
    chk("3명이 360번 마구 입력해도 같은 문서로 끝난다", a.text() == b.text() == cc.text() and not (a.infl or a.buf or b.infl or b.buf), (len(a.text()), len(b.text()), len(cc.text())))
    chk("서버가 보내는 점검값(crc)과 각자 화면이 일치", all(not any(pend is False and crc != __import__('zlib').adler32(bytes(ot.to_buf(x.text()))) and rv == x.rev for rv, crc, pend in x.crcs) for x in (a, b, cc)), "")
    await asyncio.sleep(1.2); final = a.text()
    chk("서버가 알아서 DB 에 저장한다 (저장 요청 없이)", db_text("src/Main.java") == ot.buf_text(ot.to_buf(final), safe=True), (db_text("src/Main.java")[:30], final[:30]))
    chk("저장되면 방 안의 모두에게 '저장됨'이 온다", bool(a.saved) and bool(b.saved), len(a.saved))
    # 늦게 들어온 사람은 현재 내용을 받는다
    late = Cl(2, "late"); await late.open(); m = await late.join("src/Main.java"); chk("나중에 들어온 사람도 지금까지의 내용을 그대로 받는다", late.text() == final and m["rev"] == a.rev, (late.rev, a.rev))
    # 방을 나가면 저장하고 닫는다. 마지막 사람이 나가면 즉시 저장
    await late.ws.send(json.dumps({"t": "doc", "a": "leave"})); await late.close()
    await a.type([(0, 0, "LAST")]); await asyncio.sleep(0.05)
    for x in (a, b, cc): await x.ws.send(json.dumps({"t": "doc", "a": "leave"}))
    await asyncio.sleep(0.5); chk("마지막 사람이 나가면 바로 저장하고 방을 닫는다", db_text("src/Main.java").startswith("LAST"), db_text("src/Main.java")[:10])
    # 오래된 기준·엉터리 연산 → 전체 내용을 다시 받는다
    await a.join("src/Main.java"); n0 = len([e for e in a.events if e.get("t") == "docsync"])
    await a.ws.send(json.dumps({"t": "doc", "a": "op", "project_id": PID, "path": "src/Main.java", "rev": 99, "cid": a.cid, "ops": [[0, 0, "x"]]})); await asyncio.sleep(0.3)
    chk("엉터리 기준 번호는 거부하고 전체를 다시 보낸다", len([e for e in a.events if e.get("t") == "docsync"]) == n0 + 1)
    await a.ws.send(json.dumps({"t": "doc", "a": "op", "project_id": PID, "path": "src/Main.java", "rev": a.rev, "cid": a.cid, "ops": [[1, 10**6, 5]]})); await asyncio.sleep(0.3)
    chk("범위를 벗어난 연산은 거부하고 전체를 다시 보낸다", len([e for e in a.events if e.get("t") == "docsync"]) == n0 + 2 and a.text().startswith("LAST"))
    await a.ws.send(json.dumps({"t": "doc", "a": "op", "project_id": PID, "path": "src/Main.java", "rev": a.rev, "cid": a.cid, "ops": "garbage"})); await asyncio.sleep(0.2)
    chk("형식이 틀린 메시지에도 서버가 멀쩡하다", urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3).status == 200)
    # REST 로 같은 파일을 저장하면 방이 초기화되고 새 내용을 다시 받는다
    await b.join("src/Main.java"); n1 = len([e for e in b.events if e.get("t") == "docreset"])
    st, _ = api("PUT", f"/api/projects/{PID}/files", T[3], {"path": "src/Main.java", "content": "from rest\n", "force": True})
    await asyncio.sleep(0.4); chk("REST 로 저장되면 실시간 방에 있던 화면에 '다시 받아 가라'가 온다", len([e for e in b.events if e.get("t") == "docreset"]) == n1 + 1 and st == 200)
    await b.join("src/Main.java"); chk("다시 들어가면 REST 로 저장된 내용이다", b.text() == "from rest\n", b.text())
    # 이름 변경·삭제도 방을 닫는다
    await a.join("src/Main.java"); n2 = len([e for e in a.events if e.get("t") == "docreset"])
    st, _ = api("POST", f"/api/projects/{PID}/files/rename", T[1], {"from_path": "src/Main.java", "to_path": "src/Other.java"}); await asyncio.sleep(0.3)
    chk("이름을 바꾸면 방이 닫히고 알려 준다", st == 200 and len([e for e in a.events if e.get("t") == "docreset"]) >= n2 + 1, st)
    # 한꺼번에 접속이 끊겨도(브라우저를 닫아도) 마지막 내용이 저장된다
    await a.join("src/Other.java"); await a.type([(0, 0, "BYE")]); await asyncio.sleep(0.05); await a.ws.close(); await asyncio.sleep(0.8)
    chk("입력 직후 연결이 끊겨도 내용이 저장된다", db_text("src/Other.java").startswith("BYE"), db_text("src/Other.java")[:10])
    # '파일이 바뀌었다' 일반 알림은 글자 단위 저장에서는 생략 — 다른 사람이 수신하는지
    obs = Cl(3, "obs"); await obs.open(); await obs.join("src/Other.java"); a2 = Cl(1, "a2"); await a2.open(); await a2.join("src/Other.java")
    await a2.type([(0, 0, "Z")]); await asyncio.sleep(1.5)
    chk("글자 단위 저장은 '파일이 바뀌었어요(files)' 알림을 따로 보내지 않는다", not any(e.get("t") == "files" for e in obs.events), [e.get("t") for e in obs.events][-5:])
    for x in (a, b, cc, out, obs, a2): await x.close()
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
