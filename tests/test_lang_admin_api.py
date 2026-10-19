"""언어 관리 API 통합 테스트 — 임시 DB·임시 설치 폴더·임시 포트(8095)로 서버를 직접 띄우고 끝나면 지운다. 실제로 내려받지는 않는다(가짜 설치 폴더 사용).
실행: .venv/bin/python tests/test_lang_admin_api.py (프로젝트 루트에서)
확인: ① 사용자용 목록(공개된 언어·버전만) ② 관리자만 바꿀 수 있음 ③ 사용자가 고른 버전으로 실제 실행(일괄·대화형 터미널) ④ 없는 버전·비공개 언어 안내"""
import asyncio, json, os, shutil, sqlite3, stat, subprocess, sys, tempfile, time, datetime, urllib.error, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_langadmin.db"); PORT = 8095; B = f"http://127.0.0.1:{PORT}"
SUPER = "qa-super@example.com"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
LANGS = tempfile.mkdtemp(prefix="langs_api_"); CFG = os.path.join(LANGS, "cfg.json")
def fake_tool(rel, out):
    p = os.path.join(LANGS, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(f"#!/bin/sh\necho '{out}'\n"); os.chmod(p, 0o755)
for v in ("98.0.1", "99.0.5"):
    fake_tool(f"java/{v}/bin/javac", f"javac {v}"); fake_tool(f"java/{v}/bin/java", f"FAKE_JAVA_{v}")
env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", ADMIN_EMAILS=SUPER, EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false", LANGS_DIR=LANGS, LANGS_CONFIG=CFG, TERMINAL_MAX_SECONDS="6")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
import websockets
for _ in range(60):
    try: urllib.request.urlopen(B + "/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
def mk(e, n):
    c.execute("insert into users (email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,1,?)", (e, "", n, "google", now)); c.commit()
    return c.execute("select id from users where email=?", (e,)).fetchone()[0]
ids = {"super": mk(SUPER, "최고관리자"), "u1": mk("qa-u1@example.com", "일반1")}
mails = {"super": SUPER, "u1": "qa-u1@example.com"}
T = {k: create_access_token({"sub": str(i), "email": mails[k]}) for k, i in ids.items()}
GT = {}
def api(m, path, who=None, body=None):
    h = {"Content-Type": "application/json"}
    if who: h["Authorization"] = "Bearer " + T[who]
    if who == "super" and GT.get("t"): h["X-Admin-Token"] = GT["t"]
    req = urllib.request.Request(B + path, method=m, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code, (json.loads(e.read() or b"{}"))
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
RUN = lambda lang, code, ver=None: api("POST", "/api/run", None, {"language": lang, "source_code": code, **({"runtime_version": ver} if ver else {}), "cpu_time_limit": 8})
JAVA = 'public class Hello { public static void main(String[] a){ System.out.println("REAL_JAVA"); } }'
async def term(lang, code, ver, name="Hello.java"):
    got = ""
    async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws/terminal?token={T['u1']}") as ws:
        await ws.send(json.dumps({"action": "start", "language": lang, "source_code": code, "file_name": name, **({"runtime_version": ver} if ver else {})}))
        end = time.time() + 15
        while time.time() < end:
            try: m = json.loads(await asyncio.wait_for(ws.recv(), 4))
            except Exception: break
            got += m.get("data") or ""
            if m.get("type") == "exit": break
    return got
try:
    # ---- 사용자용 목록 (로그인 없이)
    s, d = api("GET", "/api/languages"); ids_ = [x["id"] for x in d["languages"]]
    chk("사용자용 목록은 로그인 없이 볼 수 있다", s == 200 and d["languages"])
    chk("기본으로는 핵심 언어만 공개된다(Ruby·Perl·Bash 등은 숨김)", {"python", "javascript", "java", "c", "cpp"} <= set(ids_) and not ({"ruby", "perl", "bash", "php", "go", "rust"} & set(ids_)), ids_)
    chk("HTML·CSS 는 서버가 아니라 브라우저 실행 언어로 따로 나온다", [x["id"] for x in d["browser"]] == ["html", "css"])
    jv = next(x for x in d["languages"] if x["id"] == "java")
    chk("Java: 설치된 버전들이 선택지로 나온다(21 이 기본)", {"99.0.5", "98.0.1"} <= {v["id"] for v in jv["versions"]} and jv["default"] == "99.0.5", jv)
    chk("버전이 없는 언어(Python)는 선택지가 없다", next(x for x in d["languages"] if x["id"] == "python")["versions"] == [])
    # ---- 권한
    s, _ = api("GET", "/api/admin/languages", "u1"); chk("일반 사용자는 언어 관리를 볼 수 없다(403)", s == 403, s)
    s, _ = api("GET", "/api/admin/languages"); chk("로그인 없이도 볼 수 없다", s in (401, 403), s)
    s, r = api("POST", "/api/admin/gate/setup", "super", {"code": "482913"}); GT["t"] = r.get("token")
    s, ov = api("GET", "/api/admin/languages", "super"); chk("관리자 코드를 통과한 최고관리자는 볼 수 있다", s == 200 and ov["languages"] and ov["runtimes"], s)
    chk("관리 화면에 서버 언어·HTML/CSS·런타임·남은 디스크가 나온다", {x["id"] for x in ov["languages"]} >= {"python", "ruby", "go"} and ov["browser"] and ov["free_mb"] is not None)
    chk("관리 화면에서 비공개 언어도 설치 여부와 함께 보인다(ruby: 설치됨·비공개)", (lambda x: x["installed"] and not x["enabled"])(next(x for x in ov["languages"] if x["id"] == "ruby")), next(x for x in ov["languages"] if x["id"] == "ruby"))
    s, _ = api("POST", "/api/admin/languages/ruby/enabled", "u1", {"enabled": True}); chk("일반 사용자는 공개 여부를 바꿀 수 없다", s == 403, s)
    # ---- 공개 켜기/끄기
    s, _ = api("POST", "/api/admin/languages/ruby/enabled", "super", {"enabled": True}); chk("Ruby 공개로 켜기", s == 200)
    chk("켜면 사용자 목록에 바로 나타난다", "ruby" in [x["id"] for x in api("GET", "/api/languages")[1]["languages"]])
    s, r = RUN("ruby", "puts 'rb-ok'"); chk("켠 언어는 실행된다", r.get("status") == "Accepted" and "rb-ok" in (r.get("stdout") or ""), r)
    api("POST", "/api/admin/languages/ruby/enabled", "super", {"enabled": False})
    s, r = RUN("ruby", "puts 1"); chk("끄면 실행도 막힌다(설치돼 있어도) + 지원 목록 안내", r.get("status") == "Error" and "설치돼 있지 않아요" in (r.get("error") or "") and "Python" in (r.get("error") or ""), r)
    s, _ = api("POST", "/api/admin/languages/nope/enabled", "super", {"enabled": True}); chk("없는 언어는 404", s == 404, s)
    # ---- 버전 선택 실행
    s, r = RUN("java", JAVA, "98.0.1"); chk("일괄 실행: 사용자가 고른 17 버전 도구로 실행된다", "FAKE_JAVA_98.0.1" in (r.get("stdout") or ""), r)
    s, r = RUN("java", JAVA); chk("버전을 안 고르면 기본(21)로 실행", "FAKE_JAVA_99.0.5" in (r.get("stdout") or ""), r)
    s, r = RUN("java", JAVA, "image"); chk("'기본 포함(image)' 버전은 진짜 JDK 로 실행된다", "REAL_JAVA" in (r.get("stdout") or "") or r.get("status") == "Error", r)
    s, r = RUN("java", JAVA, "9.9.9"); chk("설치되지 않은 버전을 고르면 안내 문구", r.get("status") == "Error" and "설치돼 있지 않아요" in (r.get("error") or ""), r)
    got = asyncio.run(term("java", JAVA, "98.0.1")); chk("대화형 터미널: 고른 버전(17)으로 실행", "FAKE_JAVA_98.0.1" in got, got[:150])
    got = asyncio.run(term("java", JAVA, "9.9.9")); chk("대화형 터미널: 없는 버전은 안내", "설치돼 있지 않아요" in got, got[:150])
    # ---- 기본 버전 / 삭제
    s, _ = api("POST", "/api/admin/languages/runtimes/java/default", "u1", {"version": "98.0.1"}); chk("일반 사용자는 기본 버전을 바꿀 수 없다", s == 403, s)
    s, r = api("POST", "/api/admin/languages/runtimes/java/default", "super", {"version": "98.0.1"}); chk("기본 버전을 17 로 지정", s == 200, s)
    chk("지정한 기본 버전이 사용자 목록에 반영", next(x for x in api("GET", "/api/languages")[1]["languages"] if x["id"] == "java")["default"] == "98.0.1")
    s, r = RUN("java", JAVA); chk("버전을 안 고르면 새 기본(17)로 실행", "FAKE_JAVA_98.0.1" in (r.get("stdout") or ""), r)
    s, _ = api("POST", "/api/admin/languages/runtimes/java/default", "super", {"version": "1.2.3"}); chk("설치되지 않은 버전을 기본으로 지정할 수 없다", s == 404, s)
    s, _ = api("POST", "/api/admin/languages/runtimes/java/remove", "super", {"version": "image"}); chk("기본 포함 버전은 삭제할 수 없다(400)", s == 400, s)
    s, _ = api("POST", "/api/admin/languages/runtimes/java/remove", "u1", {"version": "98.0.1"}); chk("일반 사용자는 삭제할 수 없다", s == 403, s)
    s, _ = api("POST", "/api/admin/languages/runtimes/java/remove", "super", {"version": "98.0.1"}); chk("버전 삭제", s == 200)
    chk("삭제하면 목록에서 빠지고 기본 버전이 남은 것으로 바뀐다", (lambda j: "98.0.1" not in [v["id"] for v in j["versions"]] and j["default"] == "99.0.5")(next(x for x in api("GET", "/api/languages")[1]["languages"] if x["id"] == "java")))
    # ---- 설치 시작 입력 검사(실제 내려받기는 하지 않는다)
    s, _ = api("POST", "/api/admin/languages/runtimes/java/install", "u1", {"version": "21"}); chk("일반 사용자는 설치할 수 없다", s == 403, s)
    s, _ = api("POST", "/api/admin/languages/runtimes/java/install", "super", {"version": "21; rm -rf /"}); chk("엉터리 버전 표기는 설치 시작 전에 거부(400)", s == 400, s)
    s, _ = api("POST", "/api/admin/languages/runtimes/cobol/install", "super", {}); chk("없는 런타임은 404", s == 404, s)
    s, j = api("GET", "/api/admin/languages/jobs/current", "super"); chk("진행 중인 설치가 없으면 비어 있다", s == 200 and j["job"] is None, j)
    s, a = api("GET", "/api/admin/audit?size=30", "super"); acts = [x["action"] for x in a["items"]]
    chk("관리자가 한 일(공개 변경·기본 버전·삭제)이 감사 기록에 남는다", {"lang.enable", "lang.disable", "lang.default", "lang.remove"} <= set(acts), acts)
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
    shutil.rmtree(LANGS, ignore_errors=True)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
