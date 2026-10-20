"""내 PC 러너(runner/duresync_runner.py) 테스트 — 임시 HOME·임시 포트(47399)로 러너를 직접 띄우고 끝나면 지운다. 내 컴퓨터의 연결 코드 파일은 건드리지 않는다.
실행: .venv/bin/python tests/test_runner.py (프로젝트 루트에서)
확인: ① 다른 사이트·다른 주소(DNS rebinding)·잘못된 연결 코드는 거절 ② 내 PC 의 언어와 버전 목록 ③ 고른 버전으로 실행 · 입력 · 중지 · 시간 초과 ④ 연결이 끊기면 프로세스 정리"""
import asyncio, json, os, shutil, socket, stat, subprocess, sys, tempfile, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import websockets
PORT = 47399; ORIGIN = "http://localhost:8099"
HOME = tempfile.mkdtemp(prefix="runner_home_"); FAKE = tempfile.mkdtemp(prefix="runner_fake_")
node_fake = os.path.join(FAKE, "node")
open(node_fake, "w").write('#!/bin/sh\nif [ "$1" = "--version" ]; then echo v99.1.0; else echo FAKE_NODE_99; fi\n'); os.chmod(node_fake, 0o755)
env = dict(os.environ, HOME=HOME, USERPROFILE=HOME, PATH=FAKE + os.pathsep + os.environ.get("PATH", ""))
def spawn(extra=(), port=PORT):
    return subprocess.Popen([sys.executable, os.path.join(ROOT, "runner", "duresync_runner.py"), "--port", str(port), "--allow-origin", ORIGIN, *extra], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def token(*extra):
    return subprocess.run([sys.executable, os.path.join(ROOT, "runner", "duresync_runner.py"), "--show-token", *extra], env=env, capture_output=True, text=True).stdout.strip()
TOK = token()
def wait_up(port=PORT):
    for _ in range(80):
        try: socket.create_connection(("127.0.0.1", port), timeout=0.5).close(); return True
        except OSError: time.sleep(0.25)
    return False
srv = spawn(); R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
async def connect(origin=ORIGIN, tok=None, port=PORT):
    ws = await websockets.connect(f"ws://127.0.0.1:{port}/", origin=origin, max_size=8_000_000)
    await ws.send(json.dumps({"action": "hello", "token": TOK if tok is None else tok}))
    return ws, json.loads(await asyncio.wait_for(ws.recv(), 20))
async def run(ws, lang, code, ver=None, name=None, inputs=(), timeout=25, stop_after=None):
    await ws.send(json.dumps({"action": "start", "language": lang, "source_code": code, **({"runtime_version": ver} if ver else {}), **({"file_name": name} if name else {})}))
    out, t0 = "", time.time()
    for s in inputs:
        await asyncio.sleep(0.6); await ws.send(json.dumps({"action": "input", "data": s}))
    while time.time() - t0 < timeout:
        if stop_after and time.time() - t0 > stop_after:
            await ws.send(json.dumps({"action": "stop"})); stop_after = None
        try: m = json.loads(await asyncio.wait_for(ws.recv(), 1.0))
        except asyncio.TimeoutError: continue
        out += m.get("data") or ""
        if m.get("type") == "exit": return out, m.get("code")
    return out, None
async def main():
    # ---- 문지기
    r = subprocess.run(["curl", "-s", "-m", "5", f"http://127.0.0.1:{PORT}/"], capture_output=True, text=True).stdout
    chk("주소로 열어 보면 러너 이름·버전만 알려 준다", "DureSync Runner" in r, r)
    r = subprocess.run(["curl", "-s", "-m", "5", "-H", "Host: evil.example.com", f"http://127.0.0.1:{PORT}/"], capture_output=True, text=True).stdout
    chk("엉뚱한 Host(DNS rebinding)는 거절", "host not allowed" in r, r)
    try:
        await connect(origin="https://evil.example.com"); bad = False
    except Exception as e: bad = "403" in str(e)
    chk("허락하지 않은 웹사이트(Origin)에서 온 연결은 거절", bad)
    ws, h = await connect(tok="WRONG-CODE"); chk("틀린 연결 코드는 거절하고 연결을 끊는다", h.get("ok") is False and h.get("why") == "token", h)
    try: await asyncio.wait_for(ws.recv(), 3); closed = False
    except Exception: closed = True
    chk("  ㄴ 연결이 실제로 닫힘", closed)
    ws, h = await connect(); chk("맞는 연결 코드는 통과하고 내 PC 의 언어 목록을 준다", h.get("ok") is True and "python" in h.get("runtimes", {}), h.get("runtimes", {}).keys())
    inv = h["runtimes"]
    chk("버전 목록: PATH 의 가짜 node(99.1.0)와 진짜 도구가 모두 보인다", any(v["id"] == "99.1.0" for v in inv.get("javascript", [])) and len(inv["python"]) >= 1, {k: [v["id"] for v in vs] for k, vs in inv.items()})
    # ---- 실행
    out, code = await run(ws, "python", "name = input('이름: ')\nprint('안녕', name)", inputs=["배찬\n"]); chk("Python 실행 + 입력(input)", "이름:" in out and "안녕 배찬" in out and code == 0, out)
    out, code = await run(ws, "python", "raise ValueError('boom')", name="calc.py"); chk("오류는 내 파일 이름(calc.py)과 함께 보이고 종료 코드가 0 이 아니다", "calc.py" in out and "boom" in out and code != 0, out[-150:])
    out, code = await run(ws, "javascript", "console.log(1)", ver="99.1.0"); chk("고른 버전(99.1.0)의 도구로 실행된다", "FAKE_NODE_99" in out, out)
    real = next((v["id"] for v in inv["javascript"] if v["id"] != "99.1.0"), None)
    if real:
        out, code = await run(ws, "javascript", "console.log('real-node', process.version)", ver=real); chk(f"다른 버전({real})을 고르면 진짜 Node 로 실행", "real-node" in out and "FAKE" not in out, out)
    out, code = await run(ws, "javascript", "console.log('dflt')"); chk("버전을 안 고르면 가장 높은 버전(목록 맨 앞)", "FAKE_NODE_99" in out, out)
    out, code = await run(ws, "cobol", "x"); chk("없는 언어는 안내하고 끝낸다", "찾지 못했어요" in out and code == 1, out)
    if "c" in inv:
        out, code = await run(ws, "c", '#include <stdio.h>\nint main(){printf("c-ok\\n");return 0;}'); chk("C 컴파일 + 실행", "c-ok" in out and code == 0, out)
        out, code = await run(ws, "c", "int main(){ nope(); }"); chk("컴파일 에러는 메시지와 함께 종료", "컴파일 에러" in out and code != 0, out[:120])
    if "java" in inv:
        J = 'public class Zeta { public static void main(String[] a){ System.out.println("java-ok"); } }'
        out, code = await run(ws, "java", J, name="Zeta.java"); chk("Java 컴파일 + 실행", "java-ok" in out and code == 0, out[:160])
        out, code = await run(ws, "java", J, name="Test.java"); chk("Java: 파일 이름과 public 클래스가 다르면 실행하지 않고 이유를 알려 준다", "class Zeta is public" in out and "java-ok" not in out, out[:200])
    out, code = await run(ws, "python", "import time\nprint('started', flush=True)\ntime.sleep(60)", stop_after=1.5); chk("중지 버튼: 바로 종료 + 안내", "강제 중단" in out and code == -1, (out, code))
    out, code = await run(ws, "python", "x" * 600_000); chk("너무 긴 코드는 거절", "너무 길어요" in out, out[:60])
    # ---- 연결이 끊기면 실행 중이던 프로세스도 정리
    pidfile = os.path.join(HOME, "pid.txt")
    await ws.send(json.dumps({"action": "start", "language": "python", "source_code": f"import os,time\nopen({pidfile!r},'w').write(str(os.getpid()))\ntime.sleep(60)"}))
    for _ in range(40):
        if os.path.exists(pidfile) and open(pidfile).read().strip(): break
        await asyncio.sleep(0.25)
    pid = int(open(pidfile).read()); await ws.close(); await asyncio.sleep(1.5)
    try: os.kill(pid, 0); alive = True
    except OSError: alive = False
    chk("연결이 끊기면 실행 중이던 프로그램도 같이 끝난다(남아서 도는 일 없음)", not alive, pid)
    ws, h = await connect(); await ws.send(json.dumps({"action": "inventory"})); m = json.loads(await asyncio.wait_for(ws.recv(), 30)); chk("'다시 검색'(inventory)이 목록을 돌려준다", m.get("type") == "inventory" and "python" in m["runtimes"]); await ws.close()
asyncio.run(main()) if wait_up() else R.append(("러너가 켜지지 않음", False, ""))
# ---- 시간 제한 (짧은 제한으로 다른 포트에 따로)
srv2 = spawn(["--max-seconds", "5"], 47398)
async def timeout_test():
    ws, h = await connect(port=47398); out, code = await run(ws, "python", "while True: pass", timeout=20); await ws.close()
    chk("무한 반복은 제한 시간(5초)에 강제 종료 + 안내", "넘겨서 중단" in out and code == -1, out[-100:])
asyncio.run(timeout_test()) if wait_up(47398) else R.append(("2번 러너가 켜지지 않음", False, ""))
# ---- 연결 코드 파일
tp = os.path.join(HOME, ".duresync-runner", "token")
chk("연결 코드는 내 계정만 읽을 수 있는 파일(0600)에 저장된다", os.path.exists(tp) and (os.stat(tp).st_mode & 0o077) == 0, oct(os.stat(tp).st_mode) if os.path.exists(tp) else "없음")
chk("다시 켜도 같은 코드가 유지된다", token() == TOK)
chk("--reset-token 은 새 코드를 만든다", token("--reset-token") != TOK)
for p in (srv, srv2):
    p.terminate()
    try: p.wait(5)
    except Exception: p.kill()
shutil.rmtree(HOME, ignore_errors=True); shutil.rmtree(FAKE, ignore_errors=True)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
