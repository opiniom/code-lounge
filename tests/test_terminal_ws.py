"""대화형 터미널(/ws/terminal) 테스트 — 임시 DB·임시 포트(8094, 공유 모드 확인용 8093)로 서버를 직접 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_terminal_ws.py (프로젝트 루트에서)"""
import asyncio, json, os, sqlite3, subprocess, sys, time, datetime, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_term.db"); P1, P2 = 8094, 8093
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
base = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", TERMINAL_MAX_SECONDS="6", MY_SECRET_TOKEN="should-never-leak", GEMINI_API_KEY="leak-me")
def spawn(port, public=False):
    return subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)], cwd=os.path.join(ROOT, "api"),
                            env=dict(base, PUBLIC_MODE="true" if public else "false"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = spawn(P1)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
import websockets
for _ in range(60):
    try: urllib.request.urlopen(f"http://127.0.0.1:{P1}/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
for i, e in ((1, "qa-t@example.com"), (2, "qa-gone@example.com"), (3, "qa-susp@example.com")):
    c.execute("insert into users (id,email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,?,1,?)", (i, e, "", f"u{i}", "google", now))
c.execute("update users set is_active=0 where id=3"); c.execute("update users set withdrawn_at=?, is_active=1 where id=2", (now,)); c.commit()
tok = lambda i, e: create_access_token({"sub": str(i), "email": e})
T = tok(1, "qa-t@example.com")
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
async def session(port, token, steps, timeout=20):
    """steps: [('send', obj) | ('wait', 문자열 | 'exit')] — 모든 수신 메시지를 모아서 돌려준다"""
    url = f"ws://127.0.0.1:{port}/ws/terminal" + (f"?token={token}" if token is not None else "")
    got = []; closed = None
    try:
        async with websockets.connect(url) as ws:
            async def pump(pred, t):
                end = time.time() + t
                while time.time() < end:
                    try: m = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time())))
                    except asyncio.TimeoutError: return False
                    except websockets.ConnectionClosed as e:
                        nonlocal closed; closed = e.code; return pred is None
                    got.append(m)
                    if pred and pred(m): return True
                return False
            for kind, arg in steps:
                if kind == "send": await ws.send(json.dumps(arg))
                elif kind == "wait_text": await pump(lambda m, a=arg: a in (m.get("data") or ""), timeout)
                elif kind == "wait_exit": await pump(lambda m: m.get("type") == "exit", timeout)
                elif kind == "drain": await pump(None, arg)
            try:
                await asyncio.wait_for(ws.wait_closed(), 3)      # 서버가 연결을 닫았다면 그 종료 코드를 읽는다
            except Exception: pass
            closed = closed or ws.close_code
    except websockets.ConnectionClosed as e: closed = e.code
    return got, closed
txt = lambda got: "".join((m.get("data") or "") for m in got)
exits = lambda got: [m for m in got if m.get("type") == "exit"]
START = lambda lang, code, name=None: ("send", dict({"action": "start", "language": lang, "source_code": code}, **({"file_name": name} if name else {})))
async def main():
    # --- 인증
    got, closed = await session(P1, None, [("wait_exit", 5)]); chk("로그인 없이는 거부 + 안내 + 연결 종료(4401)", "로그인" in txt(got) and closed == 4401, (txt(got)[:60], closed))
    got, closed = await session(P1, "garbage.token", [("wait_exit", 5)]); chk("엉터리 토큰은 거부", closed == 4401, closed)
    got, closed = await session(P1, tok(2, "qa-gone@example.com"), [("wait_exit", 5)]); chk("탈퇴한 계정의 토큰은 거부", closed == 4401, closed)
    got, closed = await session(P1, tok(3, "qa-susp@example.com"), [("wait_exit", 5)]); chk("정지된 계정의 토큰은 거부", closed == 4401, closed)
    # --- 실행
    got, _ = await session(P1, T, [START("python", "print('hello-term')"), ("wait_exit", 10)]); e = exits(got)
    chk("Python 실행 + 정상 종료(코드 0)", "hello-term" in txt(got) and e and e[-1].get("code") == 0, txt(got)[:80])
    got, _ = await session(P1, T, [START("python", "name = input('이름: ')\nprint('안녕', name)"), ("wait_text", "이름"), ("send", {"action": "input", "data": "qa\n"}), ("wait_exit", 10)])
    chk("대화형: 프롬프트가 먼저 보이고, 입력이 stdin 으로 전달돼 결과가 나옴", "이름" in txt(got) and "안녕 qa" in txt(got), txt(got)[:120])
    got, _ = await session(P1, T, [START("python", "import os\nprint('LEAK=' + str([k for k in os.environ if any(w in k for w in ('SECRET','KEY','TOKEN','PASSWORD','DATABASE'))]) + os.environ.get('MY_SECRET_TOKEN',''))"), ("wait_exit", 10)])
    chk("서버의 환경변수(비밀)는 실행 코드에 전달되지 않음", "LEAK=[]" in txt(got) and "should-never-leak" not in txt(got) and "leak-me" not in txt(got), txt(got)[:120])
    got, _ = await session(P1, T, [START("java", "public class Hello { public static void main(String[] a){ System.out.println(\"java-ok\"); } }"), ("wait_exit", 20)])
    chk("Java: 클래스 이름이 Main 이 아니어도 실행", "java-ok" in txt(got), txt(got)[:120])
    got, _ = await session(P1, T, [START("javascript", "console.log('js-ok')"), ("wait_exit", 10)]); chk("JavaScript 실행(일괄 실행과 같은 엔진)", "js-ok" in txt(got), txt(got)[:100])
    got, _ = await session(P1, T, [START("c", "#include <stdio.h>\nint main(){printf(\"c-ok\\n\");return 0;}"), ("wait_exit", 20)]); chk("C 컴파일 후 실행", "c-ok" in txt(got), txt(got)[:100])
    got, _ = await session(P1, T, [START("c", "int main(){ nope(); }"), ("wait_exit", 20)]); chk("컴파일 에러는 메시지와 함께 종료", "컴파일 에러" in txt(got) and exits(got) and exits(got)[-1].get("code") != 0, txt(got)[:80])
    got, _ = await session(P1, T, [START("cobol", "x"), ("wait_exit", 5)]); chk("모르는 언어는 안내 + 종료", "실행할 수 없어요" in txt(got) and exits(got), txt(got)[:100])
    got, _ = await session(P1, T, [START("markdown", "# 글"), ("wait_exit", 5)]); chk("코드가 아닌 언어도 실행하지 않음(Python 으로 몰래 돌리지 않음)", "실행할 수 없어요" in txt(got), txt(got)[:100])
    # --- 파일 이름 ↔ 코드 이름 연동
    JB = "public class Zeta { public static void main(String[] a){ System.out.println(\"zeta-ok\"); } }"
    got, _ = await session(P1, T, [START("java", JB, "src/Test.java"), ("wait_exit", 10)]); e = exits(got)
    chk("자바: 파일 이름(Test.java)과 public 클래스(Zeta)가 다르면 실행하지 않고 이유를 알려 줌", "zeta-ok" not in txt(got) and "class Zeta is public" in txt(got) and "Test" in txt(got) and e and e[-1].get("code") == 1, txt(got)[:160])
    got, _ = await session(P1, T, [START("java", JB, "Zeta.java"), ("wait_exit", 20)]); chk("자바: 파일 이름과 클래스 이름이 같으면 실행", "zeta-ok" in txt(got), txt(got)[:120])
    got, _ = await session(P1, T, [START("java", "class Hello { public static void main(String[] a){ System.out.println(\"nonpub-ok\"); } }", "Anything.java"), ("wait_exit", 20)])
    chk("자바: public 클래스가 없으면 파일 이름은 아무거나 괜찮음(자바 규칙 그대로)", "nonpub-ok" in txt(got), txt(got)[:120])
    got, _ = await session(P1, T, [START("java", JB), ("wait_exit", 20)]); chk("파일 이름을 안 보내면 예전처럼 코드 기준으로 실행", "zeta-ok" in txt(got), txt(got)[:120])
    got, _ = await session(P1, T, [START("python", "raise ValueError('boom')", "calc.py"), ("wait_exit", 10)]); chk("파이썬 오류 메시지에 내 파일 이름(calc.py)이 나옴", "calc.py" in txt(got) and "main.py" not in txt(got), txt(got)[:160])
    got, _ = await session(P1, T, [START("python", "print(__file__.split('/')[-1])", "random.py"), ("wait_exit", 10)]); chk("표준 모듈과 같은 이름(random.py)은 기본 이름으로 안전하게 실행", "main.py" in txt(got), txt(got)[:100])
    got, _ = await session(P1, T, [START("python", "print('safe')", "../../etc/x y; rm.py"), ("wait_exit", 10)]); chk("이상한 파일 이름(경로·공백·기호)은 무시하고 안전하게 실행", "safe" in txt(got), txt(got)[:100])
    got, _ = await session(P1, T, [START("ruby", "puts 'rb-ok'", "x'; system('id'); '.rb"), ("wait_exit", 10)]); chk("루비: 파일 이름으로 명령을 끼워 넣을 수 없음", "uid=" not in txt(got), txt(got)[:100])
    # --- 실행 이력 저장
    got, _ = await session(P1, T, [START("python", "print('hist-ok')", "h.py"), ("wait_exit", 10)])
    got, _ = await session(P1, T, [START("python", "import sys; sys.exit(3)", "h2.py"), ("wait_exit", 10)])
    await asyncio.sleep(0.5)
    rows = sqlite3.connect(DB).execute("select language,status,stdout,exit_code,user_id from submissions order by id").fetchall()
    chk("실행할 때마다 실행 이력(submissions)에 남음(성공·실패 모두)", any(r[1] == "Accepted" and "hist-ok" in (r[2] or "") and r[4] == 1 for r in rows) and any(r[1] == "Runtime Error" and r[3] == 3 for r in rows), rows[-3:])
    chk("이름이 어긋나 막힌 자바 실행도 컴파일 에러로 이력에 남음", any(r[1] == "Compilation Error" for r in rows), [r[1] for r in rows])
    # --- 제한
    t0 = time.time(); got, _ = await session(P1, T, [START("python", "while True: pass"), ("wait_exit", 20)]); e = exits(got)
    chk("무한 반복은 최대 시간(여기선 6초)에 강제 종료 + 안내", e and "넘겨서 중단" in (e[-1].get("data") or "") and time.time() - t0 < 15, (time.time() - t0, e[-1:] if e else None))
    got, _ = await session(P1, T, [START("python", "import time\nprint('started', flush=True)\ntime.sleep(60)"), ("wait_text", "started"), ("send", {"action": "stop"}), ("wait_exit", 8), ("drain", 1.5)]); e = exits(got)
    chk("중지 버튼: 즉시 종료 + 안내는 한 번만", len(e) == 1 and "강제 중단" in (e[0].get("data") or ""), [x.get("data") for x in e])
    got, _ = await session(P1, T, [START("python", "import sys\nwhile True: sys.stdout.write('x'*5000)"), ("wait_exit", 25)])
    chk("무한 출력은 1MB 에서 중단", "너무 많아서" in txt(got) and len(txt(got)) < 1_300_000, len(txt(got)))
    # --- 공유 모드
    pub = spawn(P2, public=True)
    for _ in range(60):
        try: urllib.request.urlopen(f"http://127.0.0.1:{P2}/api/auth/config", timeout=1); break
        except Exception: await asyncio.sleep(0.5)
    got, closed = await session(P2, T, [("wait_exit", 5)]); chk("공유 모드(PUBLIC_MODE)에서는 꺼짐", "공유 모드" in txt(got) and closed == 4403, (txt(got)[:50], closed))
    pub.terminate()
try:
    asyncio.run(main())
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [r for r in R if not r[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
