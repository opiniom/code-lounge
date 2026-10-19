"""언어 설치(install-lang) · 설치한 언어 자동 인식 테스트 — 실제로 내려받지 않고, 가짜 설치 폴더로 확인한다.
실행: .venv/bin/python tests/test_lang_install.py (프로젝트 루트에서)
(실제 내려받기·설치·실행은 도커 이미지 안에서 따로 시험했다: README 의 '언어 설치' 참고)"""
import importlib.util, io, os, stat, sys, tarfile, tempfile, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
LANGS = tempfile.mkdtemp(prefix="langs_test_")
os.environ["LANGS_DIR"] = LANGS
from services import sandbox_runner as sb
spec = importlib.util.spec_from_file_location("install_lang", os.path.join(ROOT, "scripts", "install_lang.py"))
il = importlib.util.module_from_spec(spec); spec.loader.exec_module(il)

R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
def fake_tool(rel):
    p = os.path.join(LANGS, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write("#!/bin/sh\necho fake\n"); os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

sb.LANGS_DIR = LANGS; sb.TOOLS_RECHECK_SECONDS = 0.05
sb.refresh_tools()
chk("설치 전에는 Go 가 목록에 없다", not sb.available()["go"] and not sb.available()["rust"])
fake_tool("go/bin/go"); time.sleep(0.1)
chk("go/bin/go 를 놓으면 서버를 다시 켜지 않아도 목록에 오른다", sb.available()["go"] and sb.GO and sb.GO.startswith(LANGS), sb.GO)
chk("설치한 언어 폴더가 실행 PATH 에 들어간다", os.path.join(LANGS, "go", "bin") in sb._clean_env("/tmp")["PATH"].split(os.pathsep), sb._clean_env("/tmp")["PATH"][:120])
fake_tool("rust/bin/rustc"); time.sleep(0.1)
chk("Rust 도 같은 방식으로 인식", sb.available()["rust"])
import shutil; shutil.rmtree(os.path.join(LANGS, "go")); time.sleep(0.1)
chk("폴더를 지우면(install-lang remove) 목록에서도 빠진다", not sb.available()["go"] and sb.available()["rust"])
os.makedirs(os.path.join(LANGS, ".gocache"))
chk("Go 공용 캐시(.gocache)가 있으면 실행 환경에 연결된다", sb._clean_env("/tmp/x")["GOCACHE"] == os.path.join(LANGS, ".gocache"), sb._clean_env("/tmp/x")["GOCACHE"])
chk("숨김 폴더(.gocache 등)는 언어로 취급하지 않는다", all(".gocache" not in b for b in sb.lang_bins()), sb.lang_bins())
env = sb._clean_env("/tmp/x")
chk("서버 비밀(환경변수)은 실행 환경에 넘기지 않는다", "GEMINI_API_KEY" not in env and "DATABASE_URL" not in env and "JWT_SECRET" not in env)

# 설치 도구
chk("별칭: golang·csharp·c# 은 go·dotnet", il.ALIASES["golang"] == "go" and il.ALIASES["csharp"] == "dotnet" and il.ALIASES["c#"] == "dotnet")
def exits(argv):
    try: il.main(argv); return None
    except SystemExit as e: return e.code
chk("모르는 언어는 거부", exits(["nope"]) == 1)
chk("엉터리 버전(명령 끼워 넣기)은 거부", exits(["go", "1.2; rm -rf /"]) == 1 and exits(["go", "../x"]) == 1)
chk("삭제할 언어를 안 쓰면 거부", exits(["remove"]) == 1)
chk("모르는 언어 삭제도 거부", exits(["remove", "nope"]) == 1)
# 압축 안의 위험한 경로
evil = os.path.join(LANGS, "evil.tar"); 
with tarfile.open(evil, "w") as t:
    data = b"x"; ti = tarfile.TarInfo("../escape.txt"); ti.size = 1; t.addfile(ti, io.BytesIO(data))
dest = os.path.join(LANGS, "dest"); os.makedirs(dest)
try:
    il.safe_extract(evil, dest); blocked = False
except SystemExit: blocked = True
chk("압축 파일 안의 '../' 경로는 막히고 바깥에 파일이 생기지 않는다", blocked and not os.path.exists(os.path.join(LANGS, "escape.txt")))
shutil.rmtree(LANGS, ignore_errors=True)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
