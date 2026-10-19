"""언어 관리(레지스트리·설치 도구·설치 작업) 테스트 — 실제로 내려받지 않고 가짜 설치 폴더로 확인한다.
실행: .venv/bin/python tests/test_lang_install.py (프로젝트 루트에서)
(실제 내려받기·설치·실행은 도커 이미지 안에서 따로 시험한다: README 의 '언어 설치' 참고)"""
import importlib.util, io, json, os, shutil, stat, sys, tarfile, tempfile, threading, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
LANGS = tempfile.mkdtemp(prefix="langs_test_"); CFG = os.path.join(LANGS, "cfg", "languages.json")
os.environ["LANGS_DIR"] = LANGS; os.environ["LANGS_CONFIG"] = CFG
from services import lang_registry as reg, lang_install as li, lang_jobs as lj, sandbox_runner as sb

R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
def fake_tool(rel, out="fake"):
    p = os.path.join(LANGS, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(f"#!/bin/sh\necho '{out}'\n"); os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

# ---- 공개 여부 (관리자가 정한다)
chk("정하지 않은 언어는 기본 공개 목록(핵심)을 따른다", reg.is_enabled("python") and reg.is_enabled("java") and reg.is_enabled("csharp") and not reg.is_enabled("ruby") and not reg.is_enabled("go"))
reg.set_enabled("ruby", True); reg.set_enabled("python", False)
chk("공개/비공개를 바꾸면 파일에 저장되고 바로 반영된다", reg.is_enabled("ruby") and not reg.is_enabled("python") and json.load(open(CFG))["enabled"]["ruby"] is True)
chk("공개 여부가 실행 가능 목록에 반영된다(설치돼 있어도 비공개면 숨김)", not sb.available()["python"] and sb.installed()["python"] and (sb.available()["ruby"] == sb.installed()["ruby"]))
reg.set_enabled("python", True)

# ---- 여러 버전 설치 · 기본 버전 · 선택
for v in ("98.0.1", "99.0.5"):
    fake_tool(f"java/{v}/bin/javac", f"javac {v}"); fake_tool(f"java/{v}/bin/java", f"FAKE_JAVA_{v}")
fake_tool("go/1.22.5/bin/go", "go version go1.22.5 linux/amd64")
ids = reg.installed_ids("java")
chk("같은 언어의 여러 버전이 나란히 인식된다(높은 버전 먼저)", ids == ["99.0.5", "98.0.1"], ids)
vs = reg.list_versions("java")
chk("버전 목록: 설치 버전 + 이미지 기본(있으면), 실제 버전 문자열을 보여 준다", {v["id"] for v in vs} >= {"99.0.5", "98.0.1"} and next(v for v in vs if v["id"] == "99.0.5")["version"] == "99.0.5", vs)
chk("기본 버전: 관리자가 정하지 않으면 가장 높은 버전", reg.default_version("java") == "99.0.5")
fake_tool("node/10.0.0/bin/node", "v10.0.0")
chk("오래된 버전을 설치해도 기본이 내려가지 않는다(이미지 기본이 더 높으면 그대로 이미지)", (reg.default_version("node") == "image") if reg._image_exe("node") else reg.default_version("node") == "10.0.0", reg.default_version("node"))
shutil.rmtree(os.path.join(LANGS, "node"))
reg.set_default("java", "98.0.1")
chk("기본 버전을 17 로 정하면 바로 반영", reg.default_version("java") == "98.0.1" and next(v for v in reg.list_versions("java") if v["active"])["id"] == "98.0.1")
sb.refresh_tools()
chk("실행 엔진의 기본 도구가 기본 버전을 가리킨다", sb.JAVAC and "/98.0.1/" in sb.JAVAC, sb.JAVAC)
with sb.runtime_override({"java": "99.0.5"}):
    chk("사용자가 고른 버전은 기본 버전보다 우선한다", "/99.0.5/" in sb.tool("javac") and "/99.0.5/" in sb.tool("java"))
chk("override 를 벗어나면 다시 기본 버전", "/98.0.1/" in sb.tool("javac"))
chk("없는 버전을 고르면 안내 문구", "설치돼 있지 않아요" in (sb.check_runtime("java", "9.9.9") or ""))
chk("설치된 버전/이미지 기본은 통과, 버전이 없는 언어(Python)는 무시", sb.check_runtime("java", "99.0.5") is None and sb.check_runtime("python", "whatever") is None)
chk("엉터리 버전 이름(경로 문자)은 거부", reg.exe_in_version("java", "../../etc", "javac") is None and "설치돼 있지 않아요" in (sb.check_runtime("java", "../x") or ""))
chk("옛 방식 설치(go/bin/go)도 'legacy' 버전으로 인식", (fake_tool("rust/bin/rustc", "rustc 1.80.0"), "legacy" in reg.installed_ids("rust"))[1])
chk("삭제: 선택한 버전만 지워지고 기본 지정도 정리", reg.remove_version("java", "98.0.1") and reg.installed_ids("java") == ["99.0.5"] and reg.default_version("java") == "99.0.5")
chk("이미지 기본 버전은 삭제할 수 없다", reg.remove_version("java", "image") is False)
chk("옛 방식(legacy) 삭제", reg.remove_version("rust", "legacy") and "legacy" not in reg.installed_ids("rust"))

# ---- 설치 도구의 안전장치
chk("별칭: golang·csharp·c#·nodejs·jdk", li.ALIASES["golang"] == "go" and li.ALIASES["csharp"] == "dotnet" and li.ALIASES["nodejs"] == "node" and li.ALIASES["jdk"] == "java")
def raises(f):
    try: f(); return None
    except li.InstallError as e: return str(e)
chk("모르는 언어는 거부", raises(lambda: li.install("nope")) is not None)
chk("엉터리 버전(명령 끼워 넣기)은 거부", raises(lambda: li.install("go", "1.2; rm -rf /")) and raises(lambda: li.install("go", "../x")))
evil = os.path.join(LANGS, "evil.tar")
with tarfile.open(evil, "w") as t:
    ti = tarfile.TarInfo("../escape.txt"); ti.size = 1; t.addfile(ti, io.BytesIO(b"x"))
dest = os.path.join(LANGS, "dest"); os.makedirs(dest)
chk("압축 파일 안의 '../' 경로는 막히고 바깥에 파일이 생기지 않는다", raises(lambda: li._safe_extract(evil, dest)) and not os.path.exists(os.path.join(LANGS, "escape.txt")))
chk("서버 비밀(환경변수)은 실행 환경에 넘기지 않는다", "GEMINI_API_KEY" not in sb._clean_env("/tmp/x") and "DATABASE_URL" not in sb._clean_env("/tmp/x"))

# ---- 설치 작업(관리자 페이지에서 시작): 한 번에 하나, 진행 로그, 성공/실패
def fake_installer(version, log):
    log("▶ 가짜 설치 시작"); time.sleep(0.4); fake_tool("go/1.23.0/bin/go", "go version go1.23.0 linux/amd64"); log("   내려받는 중… 100%"); return "1.23.0"
li.INSTALLERS["go"] = fake_installer
li.install = (lambda orig: (lambda name, version=None, log=print: orig(name, version, log)))(li.install)
j = lj.start("go", None, "tester")
chk("설치 작업이 시작되고 진행 중으로 보인다", j["status"] == "running" and lj.current()["id"] == j["id"], j)
try:
    lj.start("go", None, "tester2"); second = "허용됨"
except RuntimeError as e:
    second = str(e)
chk("이미 설치 중이면 두 번째 설치는 거절(동시에 두 개 불가)", "설치하는 중" in second, second)
for _ in range(50):
    if lj.get(j["id"])["status"] != "running": break
    time.sleep(0.1)
done = lj.get(j["id"])
chk("설치가 끝나면 완료 상태 + 로그 + 설치된 버전", done["status"] == "done" and done["result"] == "1.23.0" and any("가짜 설치" in l for l in done["log"]), done)
chk("설치한 버전이 바로 목록에 나타난다", "1.23.0" in reg.installed_ids("go"))
li.INSTALLERS["go"] = lambda v, log: (_ for _ in ()).throw(li.InstallError("체크섬이 달라요"))
j2 = lj.start("go", None, "tester")
for _ in range(50):
    if lj.get(j2["id"])["status"] != "running": break
    time.sleep(0.1)
e2 = lj.get(j2["id"])
chk("설치 실패는 오류 상태 + 이유를 알려 준다(서버는 멀쩡)", e2["status"] == "error" and "체크섬" in e2["error"], e2)
li.INSTALLERS["go"] = lambda v, log: (_ for _ in ()).throw(RuntimeError("엉뚱한 예외"))
j3 = lj.start("go", None, "tester")
for _ in range(50):
    if lj.get(j3["id"])["status"] != "running": break
    time.sleep(0.1)
chk("예상 못 한 예외도 작업만 실패로 처리", lj.get(j3["id"])["status"] == "error")
shutil.rmtree(LANGS, ignore_errors=True)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
