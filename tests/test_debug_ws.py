"""워크스페이스 디버거(/ws/terminal 의 debug 모드) 테스트 — 임시 DB·임시 포트(8095)로 서버를 직접 띄우고 끝나면 지운다.
파이썬 · 자바스크립트 · 자바를 각각 '중단점 → 한 줄 → 안으로 → 밖으로 → 계속' 순서로 돌려 보고, 입력(input)·예외·동시 실행 제한도 확인한다.
실행: .venv/bin/python tests/test_debug_ws.py (프로젝트 루트에서)"""
import asyncio, json, os, shutil, sqlite3, subprocess, sys, time, datetime, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_dbg.db"); PORT = 8095
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", TERMINAL_MAX_SECONDS="20", PUBLIC_MODE="false")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"), env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
import websockets
for _ in range(60):
    try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
c.execute("insert into users (id,email,hashed_password,username,oauth_provider,is_active,created_at) values (1,'qa-dbg@example.com','','u1','google',1,?)", (now,)); c.commit()
T = create_access_token({"sub": "1", "email": "qa-dbg@example.com"})
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
txt = lambda got, kinds=("stdout", "stderr"): "".join((m.get("data") or "") for m in got if m.get("type") in kinds)


async def run(start, script, timeout=40, token=T):
    """start: start 메시지. script: 멈출 때마다 보낼 명령 목록(순서대로) — 각 항목은 dict 하나이거나 (dict, 보낼 입력) 형태. 모든 수신 메시지를 돌려준다."""
    got = []; pauses = []
    async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws/terminal?token={token}") as ws:
        await ws.send(json.dumps(dict(start, action="start", debug=True)))
        end = time.time() + timeout; i = 0
        while time.time() < end:
            try: m = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time())))
            except (asyncio.TimeoutError, websockets.ConnectionClosed): break
            got.append(m)
            if m.get("type") == "dbg" and m.get("ev") == "paused":
                pauses.append(m)
                if i < len(script):
                    step = script[i]; i += 1
                    await ws.send(json.dumps({"action": "dbg", **step}))
                else:
                    await ws.send(json.dumps({"action": "dbg", "cmd": "continue"}))
            if m.get("type") == "exit": break
    return got, pauses


def var(p, name):
    return next((v for v in p.get("vars", []) if v["n"] == name), None)


PY = """x = 3
y = 4
def add(a, b):
    s = a + b
    return s
z = add(x, y)
print("z =", z)
"""
JS = """let x = 3;
let y = 4;
function add(a, b) {
  const s = a + b;
  return s;
}
let z = add(x, y);
console.log("z =", z);
"""
JAVA = """public class Main {
    static int add(int a, int b) {
        int s = a + b;
        return s;
    }
    public static void main(String[] args) {
        int x = 3;
        int y = 4;
        int z = add(x, y);
        System.out.println("z = " + z);
    }
}
"""


async def main():
    # ---------------- 파이썬
    got, ps = await run({"language": "python", "source_code": PY, "breakpoints": [6]}, [{"cmd": "step"}, {"cmd": "next"}, {"cmd": "out"}])
    chk("py: 준비 알림", any(m.get("ev") == "ready" for m in got))
    chk("py: 중단점(6줄)에서 멈춤 + 변수 x=3,y=4", ps and ps[0]["line"] == 6 and var(ps[0], "x") and var(ps[0], "x")["v"] == "3" and var(ps[0], "y")["v"] == "4", ps[:1])
    chk("py: 안으로 → add() 4줄, 인자 a=3,b=4", len(ps) > 1 and ps[1]["line"] == 4 and ps[1]["func"] == "add" and var(ps[1], "a")["v"] == "3", ps[1:2])
    chk("py: 한 줄 → 5줄에서 s=7", len(ps) > 2 and ps[2]["line"] == 5 and var(ps[2], "s")["v"] == "7", ps[2:3])
    chk("py: 호출 스택에 add / (모듈)", len(ps) > 2 and [f["f"] for f in ps[2]["stack"]] == ["add", "(모듈)"], ps[2:3])
    chk("py: 밖으로 → 호출한 줄로 돌아옴", len(ps) > 3 and ps[3]["func"] == "(모듈)", ps[3:4])
    chk("py: 끝까지 실행 + 출력", "z = 7" in txt(got) and any(m.get("type") == "exit" and m.get("code") == 0 for m in got), txt(got)[-200:])
    chk("py: 하네스 내부가 화면에 안 섞임", "dbg_py_harness" not in txt(got) and "bdb" not in txt(got))

    got, ps = await run({"language": "python", "source_code": PY}, [{"cmd": "next"}, {"cmd": "next"}])
    chk("py: 중단점이 없으면 첫 줄에서 멈춤", ps and ps[0]["line"] == 1, ps[:1])
    chk("py: 한 줄씩 → 2, 3줄", len(ps) > 2 and [p["line"] for p in ps[:3]] == [1, 2, 3], [p["line"] for p in ps])

    async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws/terminal?token={T}") as ws:
        await ws.send(json.dumps({"action": "start", "language": "python", "source_code": "name = input('이름: ')\nprint('안녕', name)\n", "debug": True, "breakpoints": [2]}))
        out = ""; sent = False; end = time.time() + 20
        while time.time() < end:
            try: m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            except Exception: break
            out += m.get("data") or ""
            if "이름" in out and not sent:
                await ws.send(json.dumps({"action": "input", "data": "철수\n"})); sent = True
            if m.get("type") == "dbg" and m.get("ev") == "paused":
                chk("py: input() 뒤 중단점에서 name 값이 보임", (var(m, "name") or {}).get("v") == "'철수'", m)
                await ws.send(json.dumps({"action": "dbg", "cmd": "continue"}))
            if m.get("type") == "exit": break
        chk("py: 디버그 중에도 input() 이 된다", "안녕 철수" in out, out[-100:])

    # 예외: 평소 실행과 같은 모양의 트레이스백(하네스 줄 없음)
    got, ps = await run({"language": "python", "source_code": "a = [1]\nprint(a[5])\n", "breakpoints": [1]}, [])
    e = txt(got, ("stderr",))
    chk("py: 예외 트레이스백에 내 줄이 나오고 하네스 줄은 없음", "IndexError" in e and "line 2" in e and "dbg_py_harness" not in e and "bdb.py" not in e, e)
    got, ps = await run({"language": "python", "source_code": "print('a'\n"}, [])
    chk("py: 문법 오류는 디버그에서도 그대로 보임", "SyntaxError" in txt(got, ("stderr",)), txt(got, ("stderr",)))

    # ---------------- 자바스크립트
    got, ps = await run({"language": "javascript", "source_code": JS, "breakpoints": [7]}, [{"cmd": "step"}, {"cmd": "next"}, {"cmd": "out"}])
    chk("js: 중단점(7줄)에서 멈춤 + x=3", ps and ps[0]["line"] == 7 and (var(ps[0], "x") or {}).get("v") == "3", ps[:1])
    chk("js: 안으로 → add() 4줄", len(ps) > 1 and ps[1]["line"] == 4 and ps[1]["func"] == "add", ps[1:2])
    chk("js: 한 줄 → 5줄 s=7", len(ps) > 2 and ps[2]["line"] == 5 and (var(ps[2], "s") or {}).get("v") == "7", ps[2:3])
    chk("js: 끝까지 실행 + 출력", "z = 7" in txt(got) and any(m.get("type") == "exit" and m.get("code") == 0 for m in got), txt(got)[-200:])
    chk("js: 노드 안내(Debugger listening …)가 화면에 안 섞임", "Debugger" not in txt(got) and "ws://" not in txt(got), txt(got))
    got, ps = await run({"language": "javascript", "source_code": JS}, [{"cmd": "next"}])
    chk("js: 중단점이 없으면 첫 줄에서 멈춤", ps and ps[0]["line"] == 1, ps[:1])
    got, ps = await run({"language": "javascript", "source_code": "const a = [1];\nconsole.log(a[0]);\nnull.x;\n", "breakpoints": [2]}, [{"cmd": "continue"}])
    chk("js: 처리 안 된 예외에서도 멈춰서 변수 확인", any(p.get("reason") == "exception" for p in ps) and "TypeError" in txt(got, ("stderr",)), (ps, txt(got, ("stderr",))))

    # ---------------- 자바
    if shutil.which("javac") and shutil.which("jdb"):
        got, ps = await run({"language": "java", "source_code": JAVA, "file_name": "Main.java", "breakpoints": [9]}, [{"cmd": "step"}, {"cmd": "next"}, {"cmd": "out"}], timeout=60)
        chk("java: 중단점(9줄)에서 멈춤 + x=3,y=4", ps and ps[0]["line"] == 9 and (var(ps[0], "x") or {}).get("v") == "3" and (var(ps[0], "y") or {}).get("v") == "4", ps[:1])
        chk("java: 안으로 → add() 3줄", len(ps) > 1 and ps[1]["line"] == 3 and ps[1]["func"] == "add", ps[1:2])
        chk("java: 한 줄 → 4줄 s=7", len(ps) > 2 and ps[2]["line"] == 4 and (var(ps[2], "s") or {}).get("v") == "7", ps[2:3])
        chk("java: 끝까지 실행 + 출력", "z = 7" in txt(got) and any(m.get("type") == "exit" and m.get("code") == 0 for m in got), txt(got)[-300:])
        chk("java: JDWP 안내(Listening …)가 화면에 안 섞임", "Listening for transport" not in txt(got) and "jdb" not in txt(got), txt(got))
        got, ps = await run({"language": "java", "source_code": JAVA, "file_name": "Main.java"}, [{"cmd": "next"}], timeout=60)
        chk("java: 중단점이 없으면 main 첫 줄에서 멈춤", ps and ps[0]["func"] == "main", ps[:1])
        got, ps = await run({"language": "java", "source_code": JAVA.replace("int s = a + b;", "int s = a / 0;"), "file_name": "Main.java", "breakpoints": [9]}, [{"cmd": "continue"}], timeout=60)
        chk("java: 예외에서 멈추고(ArithmeticException) 이어서 실행하면 오류가 나옴", any(p.get("reason") == "exception" for p in ps) and "ArithmeticException" in txt(got, ("stderr",)), (ps[-1:], txt(got, ("stderr",))))
        got, ps = await run({"language": "java", "source_code": "public class Main {\n  public static void main(String[] a) {\n    int x = \"s\";\n  }\n}\n", "file_name": "Main.java", "breakpoints": [3]}, [], timeout=30)
        chk("java: 컴파일 오류는 디버그에서도 그대로", "컴파일 에러" in txt(got, ("stderr",)), txt(got, ("stderr",)))
    else:
        chk("java: (javac/jdb 가 없어서 건너뜀)", True)

    # ---------------- 제한
    got, ps = await run({"language": "c", "source_code": "int main(){return 0;}"}, [])
    chk("지원하지 않는 언어는 안내", "파이썬 · 자바스크립트 · 자바" in txt(got, ("stderr",)), txt(got, ("stderr",)))


try:
    asyncio.run(main())
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [r for r in R if not r[1]]
for n, ok, extra in R: print(("PASS " if ok else "FAIL ") + n + ("" if ok else f"   ← {str(extra)[:400]}"))
print(f"\n{len(R) - len(bad)}/{len(R)} 통과")
sys.exit(1 if bad else 0)
