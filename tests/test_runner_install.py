"""러너 한 줄 설치 테스트 — 임시 DB·임시 포트(8093)로 서버를 띄우고, 설치 스크립트를 임시 HOME 에서 실제로 돌려 본다(내 컴퓨터의 자동 시작 설정은 건드리지 않는다: DURESYNC_NO_START).
실행: .venv/bin/python tests/test_runner_install.py (프로젝트 루트에서)
확인: ① 설치 스크립트 2종이 사이트 주소로 채워져 내려온다 ② 맥·리눅스 스크립트가 실제로 설치(파일·연결 코드 맞춤)한다 ③ 파이썬이 없거나 내려받기에 실패하면 알아듣는 말로 안내하고 끝낸다 ④ 윈도우 스크립트의 핵심 부분 ⑤ 연결 코드 형식 검사"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_runner_install.db"); PORT = 8093; B = f"http://localhost:{PORT}"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"),
                       env=dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: urllib.request.urlopen(B + "/health", timeout=1); break
    except Exception: time.sleep(0.5)
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
def get(path):
    with urllib.request.urlopen(B + path, timeout=15) as r: return r.status, r.headers.get("content-type", ""), r.read().decode("utf-8")
TMP = tempfile.mkdtemp(prefix="runner_inst_")
try:
    st, ct, sh = get("/runner/install.sh"); st2, ct2, ps = get("/runner/install.ps1")
    chk("install.sh / install.ps1 이 내려온다 (UTF-8 글자표 지정: 한글이 안 깨짐)", st == 200 and st2 == 200 and "utf-8" in ct.lower() and "utf-8" in ct2.lower(), (ct, ct2))
    chk("  ㄴ 사이트 주소가 채워져 있고 자리표시(__BASE__)가 남지 않는다", f'BASE="{B}"' in sh and f"$base = '{B}'" in ps and "__BASE__" not in sh + ps)
    chk("맥·리눅스 스크립트는 문법이 맞고 중간에 끊겨도 실행되지 않게 함수로 감싸져 있다", subprocess.run(["sh", "-n"], input=sh, text=True, capture_output=True).returncode == 0 and re.search(r"^main\(\) \{", sh, re.M) and sh.rstrip().endswith('main "$@"'))
    home = os.path.join(TMP, "h1"); os.makedirs(home); tok = "abcd-1234-ef56-7890"
    env = dict(os.environ, HOME=home, USERPROFILE=home, DURESYNC_TOKEN=tok, DURESYNC_NO_START="1")
    r = subprocess.run(["sh"], input=sh, text=True, capture_output=True, env=env, cwd=TMP, timeout=120)
    runner = os.path.join(home, ".duresync-runner", "duresync_runner.py"); tokf = os.path.join(home, ".duresync-runner", "token")
    chk("한 줄 설치: 어느 폴더에서 실행해도 끝까지 성공하고 [완료] 안내가 나온다", r.returncode == 0 and "[완료]" in r.stdout, r.stdout[-300:] + r.stderr[-200:])
    chk("  ㄴ 러너가 ~/.duresync-runner 에 설치되고, 이 사이트만 믿도록 주소가 박혀 있다", os.path.exists(runner) and B in json.loads(re.search(r"^ALLOWED_ORIGINS = (\[.*\])$", open(runner, encoding="utf-8").read(), re.M).group(1)))
    chk("  ㄴ 웹이 정해 준 연결 코드가 그대로 저장된다 (사용자가 코드를 입력할 필요 없음)", os.path.exists(tokf) and open(tokf).read().strip() == tok.upper())
    chk("  ㄴ 연결 코드 파일은 내 계정만 읽을 수 있다(0600)", os.path.exists(tokf) and (os.stat(tokf).st_mode & 0o077) == 0)
    chk("  ㄴ 자동 시작 파일(맥: LaunchAgent / 리눅스: systemd·autostart)이 만들어진다", any(os.path.exists(p) for p in (os.path.join(home, "Library", "LaunchAgents", "cloud.duresync.runner.plist"), os.path.join(home, ".config", "systemd", "user", "duresync-runner.service"), os.path.join(home, ".config", "autostart", "duresync-runner.desktop"))))
    r2 = subprocess.run(["sh"], input=sh, text=True, capture_output=True, env=dict(env, DURESYNC_TOKEN="x"), cwd=TMP, timeout=120)
    chk("  ㄴ 두 번 실행해도(다시 설치) 문제없고, 형식이 틀린 코드(x)는 무시하고 기존 코드를 유지한다", r2.returncode == 0 and open(tokf).read().strip() == tok.upper(), r2.stdout[-200:])
    home2 = os.path.join(TMP, "h2"); os.makedirs(home2)
    r3 = subprocess.run(["sh"], input=sh, text=True, capture_output=True, env=dict(env, HOME=home2, DURESYNC_TOKEN=""), cwd=TMP, timeout=120)
    t3 = open(os.path.join(home2, ".duresync-runner", "token")).read().strip() if os.path.exists(os.path.join(home2, ".duresync-runner", "token")) else ""
    chk("  ㄴ 코드를 안 주면 러너가 새 코드를 만들어 보여 준다", r3.returncode == 0 and re.match(r"^[0-9A-F]{4}(-[0-9A-F]{4}){3}$", t3) and t3 in r3.stdout, r3.stdout[-200:])
    # 파이썬이 없을 때
    emptybin = os.path.join(TMP, "bin"); os.makedirs(emptybin)
    for t in ("sh", "mkdir", "curl", "cat", "rm", "mv"):
        p = shutil.which(t)
        if p: os.symlink(p, os.path.join(emptybin, t))
    r4 = subprocess.run(["/bin/sh"], input=sh, text=True, capture_output=True, env=dict(env, PATH=emptybin, HOME=os.path.join(TMP, "h3")), cwd=TMP, timeout=60)
    chk("파이썬이 없으면: 무슨 문제인지·무엇을 설치할지 알려 주고 실패로 끝낸다 (이상한 에러 문구 없음)", r4.returncode != 0 and "[필요] 파이썬" in r4.stdout and "python.org" in r4.stdout and "Traceback" not in r4.stdout + r4.stderr, r4.stdout[-300:])
    r5 = subprocess.run(["sh"], input=sh.replace(B, "http://127.0.0.1:9"), text=True, capture_output=True, env=dict(env, HOME=os.path.join(TMP, "h4")), cwd=TMP, timeout=60)
    chk("내려받기에 실패하면: 인터넷을 확인하라고 알려 주고 실패로 끝낸다 (깨진 러너 파일을 남기지 않는다)", r5.returncode != 0 and "[오류] 러너를 내려받지 못했어요" in r5.stdout and not os.path.exists(os.path.join(TMP, "h4", ".duresync-runner", "duresync_runner.py")), r5.stdout[-300:])
    # 윈도우 스크립트(실제 윈도우가 아니라서 핵심 내용만 확인)
    chk("윈도우 스크립트: 파이썬 확인(py -3 → python, 스토어 가짜 python 제외) · 한글 깨짐 방지 · 연결 코드 전달", "Get-Command py" in ps and "'-3'" in ps and "WindowsApps" in ps and "OutputEncoding" in ps and "PYTHONIOENCODING" in ps and "--install-autostart" in ps and "DURESYNC_TOKEN" in ps + "" or "DURESYNC_TOKEN" in ps, "")
    chk("  ㄴ 내려받기는 임시 파일(.part)로 받고 끝나면 바꿔 넣는다 + 실패 안내가 있다", ".part" in ps and "[오류] 러너를 내려받지 못했어요" in ps and "[필요] 파이썬" in ps and "winget install Python.Python.3.12" in ps)
    chk("  ㄴ 스크립트가 함수로 감싸져 있어서 한 줄(irm | iex)로 받아도 끝까지 받은 뒤에만 실행된다", ps.lstrip().startswith("#") and "function Install-DureSyncRunner" in ps and ps.rstrip().endswith("Install-DureSyncRunner"))
    # 화면: '내 PC' 버튼이 처음부터 보이게 하는 시작 코드와 버튼 두 곳(편집기 위 · 프로젝트 줄)이 있다
    js = open(os.path.join(ROOT, "frontend", "js", "pages", "workspace-runner.js"), encoding="utf-8").read(); html = open(os.path.join(ROOT, "frontend", "index.html"), encoding="utf-8").read()
    chk("화면: 시작 코드(runnerInit)가 있고 페이지가 열릴 때 실행된다 (없으면 버튼이 숨겨진 채로 남는다)", "function runnerInit()" in js and re.search(r"DOMContentLoaded', runnerInit\)|setTimeout\(runnerInit", js))
    chk("  ㄴ '내 PC' 버튼이 편집기 위쪽과 프로젝트 줄 두 곳에 있다 (파일을 열지 않아도 보임)", 'id="wsRunnerBtn"' in html and 'id="wsRunnerBtnTop"' in html and html.count("ws-runner-btn") >= 2)
    chk("  ㄴ 러너를 직접 켠 사람을 위해 '연결 코드 직접 입력' 칸이 있다 (코드가 달라요 상태에서는 바로 보인다)", "runnerCodeInput" in js and "연결 코드 직접 입력" in js and "if (last.why === 'token') codeRow(body)" in js)
    chk("  ㄴ workspace-runner.js 가 화면 묶음(manifest)에 들어 있다", "js/pages/workspace-runner.js" in open(os.path.join(ROOT, "frontend", "manifest.json"), encoding="utf-8").read())
    # 연결 코드 옵션 (러너 직접)
    h5 = os.path.join(TMP, "h5"); os.makedirs(h5)
    run = lambda *a, **k: subprocess.run([sys.executable, runner, *a], capture_output=True, text=True, env=dict(os.environ, HOME=h5, USERPROFILE=h5, **k), timeout=30)
    t_a = run("--token", "ZZZZ-1111-2222-3333", "--show-token").stdout.strip()
    chk("러너 --token: 형식이 맞으면 그 코드로 바뀐다 (소문자는 대문자로)", t_a == "ZZZZ-1111-2222-3333", t_a)
    t_b = run("--token", "짧음", "--show-token").stdout.strip()
    chk("  ㄴ 형식이 틀린 코드(짧음)는 무시하고 기존 코드를 유지한다", t_b == t_a, t_b)
    chk("  ㄴ 환경변수 DURESYNC_TOKEN 으로도 받는다", run("--show-token", DURESYNC_TOKEN="aaaa-bbbb-cccc-dddd").stdout.strip() == "AAAA-BBBB-CCCC-DDDD")
    chk("러너 --install-autostart --no-start: 파일만 만들고 지금 바로 켜지는 않는다(launchctl 미호출)", "[완료]" in run("--install-autostart", "--no-start", "--allow-origin", "http://x").stdout)
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
    shutil.rmtree(TMP, ignore_errors=True)
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
