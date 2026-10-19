"""로컬 코드 실행 샌드박스.

 · 서버에 설치된 도구를 자동으로 찾아서, 쓸 수 있는 언어만 지원 목록(/health)에 올린다.
   Python · JavaScript · TypeScript · Java · C · C++ · C# · Ruby · PHP · Perl · Bash · Go · Rust
 · 없는 도구는 가짜 결과를 만들지 않고 "이 서버에는 ○○가 설치돼 있지 않아요" 라고 솔직하게 알린다.
 · 실행 코드는 임시 폴더에서만 돌고, 서버의 환경변수(비밀키·토큰)는 넘겨주지 않는다.
 · 시간 제한 · 출력 크기 제한 · (POSIX) CPU/파일 크기 제한 · 프로세스 그룹 통째로 종료.
주의: 이 샌드박스는 컨테이너/VM 같은 완전한 격리가 아니다. 공개 서버에서는 PUBLIC_MODE 로 끄거나 Judge0 같은 별도 격리 환경을 쓰는 것을 권장한다.
"""
import asyncio
import glob
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from typing import Dict, List, Optional, Tuple

from config import settings
from schemas import CodeRunResponse

IS_WINDOWS = os.name == "nt"
OUTPUT_LIMIT = 256 * 1024          # 출력은 이만큼만 돌려준다 (무한 출력으로 서버가 느려지는 것 방지)
COMPILE_TIMEOUT = 25.0

PYTHON_EXEC = sys.executable

# 언어 도구를 찾는 규칙은 lang_registry 에 있다: 이미지에 기본으로 들어 있는 것 + /opt/langs(도커 볼륨)에 나중에 설치한 여러 버전.
# 어떤 언어를 사용자에게 열어 둘지는 관리자가 정한다(공개 여부).
from contextvars import ContextVar
from contextlib import contextmanager
from services import lang_registry as registry

LANGS_DIR = registry.LANGS_DIR
TOOLS_RECHECK_SECONDS = 10.0
_tools_at = 0.0
RUN_VERSIONS: ContextVar = ContextVar("run_versions", default=None)    # 이번 실행에서 사용자가 고른 버전 {런타임: 버전 id}


def _find(name: str) -> Optional[str]:
    return shutil.which(name)


def _default_exe(rt: str, exe: str) -> Optional[str]:
    return registry.exe_in_version(rt, registry.default_version(rt), exe)


NODE = RUBY = PHP = PERL = BASH = GO = RUSTC = JAVAC = JAVA = GCC = GPP = MCS = MONO = DOTNET = None
CSC = None
DOTNET_CSHARP: Optional[Dict[str, str]] = None       # 기본 .NET SDK 의 C# 컴파일에 필요한 위치들 (없으면 None)
_dotnet_cache: Dict[str, Optional[Dict[str, str]]] = {}


def dotnet_info(dotnet_exe: Optional[str]) -> Optional[Dict[str, str]]:
    """그 .NET SDK 에서 C# 컴파일러(csc.dll)·참조 어셈블리·런타임 버전을 찾는다"""
    if not dotnet_exe:
        return None
    root = os.path.dirname(os.path.realpath(dotnet_exe))
    if root in _dotnet_cache and _dotnet_cache[root]:
        return _dotnet_cache[root]
    try:
        csc = sorted(glob.glob(os.path.join(root, "sdk", "*", "Roslyn", "bincore", "csc.dll")))[-1]
        refdir = sorted(d for d in glob.glob(os.path.join(root, "packs", "Microsoft.NETCore.App.Ref", "*", "ref", "net*")) if os.path.isdir(d))[-1]
        rt = os.path.basename(sorted(glob.glob(os.path.join(root, "shared", "Microsoft.NETCore.App", "*")))[-1])
    except IndexError:
        return None
    info = {"root": root, "csc": csc, "refdir": refdir, "runtime": rt, "tfm": "net" + ".".join(rt.split(".")[:2])}
    _dotnet_cache[root] = info
    return info


def tool(exe: str, runtime: Optional[str] = None) -> Optional[str]:
    """실행 도구의 경로. 사용자가 이번 실행에서 버전을 골랐으면 그 버전의 것, 아니면 기본 버전의 것"""
    rt = runtime or {"javac": "java", "java": "java", "node": "node", "dotnet": "dotnet", "go": "go", "rustc": "rust"}.get(exe)
    if rt:
        vid = (RUN_VERSIONS.get() or {}).get(rt)
        if vid:
            p = registry.exe_in_version(rt, vid, exe)
            if p:
                return p
    return {"node": NODE, "javac": JAVAC, "java": JAVA, "dotnet": DOTNET, "go": GO, "rustc": RUSTC}.get(exe)


@contextmanager
def runtime_override(versions: Optional[Dict[str, str]]):
    token = RUN_VERSIONS.set(dict(versions) if versions else None)
    try:
        yield
    finally:
        RUN_VERSIONS.reset(token)


def check_runtime(lang: str, version: Optional[str]) -> Optional[str]:
    """사용자가 고른 버전이 정말 설치돼 있는지 확인. 문제가 있으면 안내 문구, 괜찮으면 None"""
    if not version:
        return None
    rt = registry.runtime_for_lang(lang)
    if not rt:
        return None                                  # 버전을 고를 수 없는 언어(Python·C 등)는 무시
    if not any(v["id"] == version for v in registry.list_versions(rt)):
        return f"{LABELS.get(lang, lang)} {version} 버전은 이 서버에 설치돼 있지 않아요. 다른 버전을 골라 주세요."
    return None


def tool_path() -> str:
    return os.environ.get("PATH", "/usr/bin:/bin")


def refresh_tools() -> None:
    """설치된 언어 도구를 다시 찾는다. 서버를 다시 켜지 않아도 새로 설치한 언어가 목록에 오른다."""
    global NODE, RUBY, PHP, PERL, BASH, GO, RUSTC, JAVAC, JAVA, GCC, GPP, MCS, MONO, DOTNET, CSC, DOTNET_CSHARP, TS_FLAGS, _tools_at
    RUBY, PHP, PERL, BASH = _find("ruby"), _find("php"), _find("perl"), _find("bash")
    NODE, JAVAC, JAVA = _default_exe("node", "node"), _default_exe("java", "javac"), _default_exe("java", "java")
    GO, RUSTC, DOTNET = _default_exe("go", "go"), _default_exe("rust", "rustc"), _default_exe("dotnet", "dotnet")
    GCC, GPP = _find("gcc") or _find("clang"), _find("g++") or _find("clang++")
    MCS, MONO = _find("mcs"), _find("mono")
    CSC = next((p for p in (r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe", r"C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe") if os.path.exists(p)), None) if IS_WINDOWS else None
    DOTNET_CSHARP = dotnet_info(DOTNET)
    TS_FLAGS = ts_flags(NODE)
    _tools_at = time.monotonic()


_ts_cache: Dict[str, Optional[List[str]]] = {}


def ts_flags(node_exe: Optional[str]) -> Optional[List[str]]:
    """Node 가 TypeScript 를 직접 실행할 수 있으면 필요한 옵션 목록(없으면 []), 못 하면 None"""
    if not node_exe:
        return None
    if node_exe in _ts_cache:
        return _ts_cache[node_exe]
    try:
        v = subprocess.run([node_exe, "--version"], capture_output=True, text=True, timeout=5).stdout.strip().lstrip("v")
        major, minor = (int(x) for x in v.split(".")[:2])
    except Exception:
        return None
    if major > 23 or (major == 23 and minor >= 6) or (major == 22 and minor >= 18):
        res: Optional[List[str]] = []
    elif major == 22 and minor >= 6:
        res = ["--experimental-strip-types"]
    else:
        res = None
    _ts_cache[node_exe] = res
    return res


TS_FLAGS: Optional[List[str]] = None
refresh_tools()

# 화면에 보여줄 이름
LABELS = {"python": "Python", "javascript": "JavaScript", "typescript": "TypeScript", "java": "Java", "c": "C", "cpp": "C++", "csharp": "C#",
          "ruby": "Ruby", "php": "PHP", "perl": "Perl", "bash": "Bash", "go": "Go", "rust": "Rust"}
ALIASES = {"py": "python", "python3": "python", "js": "javascript", "node": "javascript", "nodejs": "javascript", "ts": "typescript", "c++": "cpp", "cc": "cpp",
           "cs": "csharp", "c#": "csharp", "rb": "ruby", "sh": "bash", "shell": "bash", "golang": "go", "rs": "rust", "pl": "perl"}


def installed() -> Dict[str, bool]:
    """이 서버에 도구가 설치돼 있는 언어 (공개 여부와 상관없이)"""
    if time.monotonic() - _tools_at > TOOLS_RECHECK_SECONDS:
        refresh_tools()
    return {
        "python": os.path.exists(PYTHON_EXEC), "javascript": bool(NODE), "typescript": TS_FLAGS is not None, "java": bool(JAVAC and JAVA),
        "c": bool(GCC), "cpp": bool(GPP), "csharp": bool(CSC or (MCS and MONO) or DOTNET_CSHARP), "ruby": bool(RUBY), "php": bool(PHP), "perl": bool(PERL),
        "bash": bool(BASH) and not IS_WINDOWS, "go": bool(GO), "rust": bool(RUSTC),
    }


def available() -> Dict[str, bool]:
    """사용자가 실제로 실행할 수 있는 언어 = 설치돼 있고 + 관리자가 공개한 것"""
    return {k: ok and registry.is_enabled(k) for k, ok in installed().items()}


def decode_bytes(data: bytes) -> str:
    """UTF-8 및 CP949(Windows 콘솔)를 안전하게 디코딩"""
    if not data:
        return ""
    for enc in ("utf-8", "cp949"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="replace")


def _clean_env(workdir: str) -> Dict[str, str]:
    """서버의 환경변수(비밀키·토큰 등)는 넘기지 않고, 실행에 꼭 필요한 것만 준다"""
    gocache = os.environ.get("SANDBOX_GOCACHE") or os.path.join(LANGS_DIR, ".gocache")
    env = {"PATH": tool_path(), "HOME": workdir, "TMPDIR": workdir, "TEMP": workdir, "TMP": workdir,
           "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1",
           "GOCACHE": gocache if os.path.isdir(gocache) else os.path.join(workdir, ".gocache"), "GOPATH": os.path.join(workdir, ".gopath"), "GOFLAGS": "-mod=mod", "NO_COLOR": "1"}
    di = dotnet_info(tool("dotnet"))
    if di:
        env.update({"DOTNET_ROOT": di["root"], "DOTNET_NOLOGO": "1", "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_CLI_HOME": workdir,
                    "DOTNET_SYSTEM_GLOBALIZATION_INVARIANT": "1", "DOTNET_EnableDiagnostics": "0"})
    if IS_WINDOWS:
        for k in ("SystemRoot", "SYSTEMROOT", "COMSPEC", "PATHEXT", "WINDIR"):
            if os.environ.get(k):
                env[k] = os.environ[k]
    return env


def _limits(cpu_seconds: int):
    """POSIX: 자식 프로세스의 CPU 시간·만들 수 있는 파일 크기를 제한"""
    if IS_WINDOWS:
        return None
    def apply():
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
            resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        except Exception:
            pass
    return apply


def _kill(proc) -> None:
    try:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


async def _read_capped(stream, cap: int) -> bytes:
    buf = bytearray()
    while True:
        chunk = await stream.read(65536)
        if not chunk:
            break
        if len(buf) < cap:
            buf.extend(chunk[: cap - len(buf)])
    return bytes(buf)


async def _run(argv: List[str], cwd: str, stdin: str, timeout: float, cpu: Optional[int] = None) -> Tuple[Optional[int], str, str, float, bool, bool]:
    """프로세스를 실행해 (종료코드, stdout, stderr, 걸린 시간, 시간초과?, 출력이 잘림?) 을 돌려준다"""
    kwargs = {}
    if not IS_WINDOWS:
        kwargs["start_new_session"] = True
        kwargs["preexec_fn"] = _limits(int(cpu or timeout) + 1)
    start = time.perf_counter()
    proc = await asyncio.create_subprocess_exec(*argv, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                                                cwd=cwd, env=_clean_env(cwd), **kwargs)
    out_t = asyncio.ensure_future(_read_capped(proc.stdout, OUTPUT_LIMIT + 1))
    err_t = asyncio.ensure_future(_read_capped(proc.stderr, OUTPUT_LIMIT + 1))
    try:
        if proc.stdin:
            try:
                proc.stdin.write((stdin or "").encode("utf-8")); await proc.stdin.drain()
            except Exception:
                pass
            try:
                proc.stdin.close()
            except Exception:
                pass
        await asyncio.wait_for(proc.wait(), timeout=timeout)
        timed_out = False
    except asyncio.TimeoutError:
        timed_out = True
        _kill(proc)
        try:
            await asyncio.wait_for(proc.wait(), timeout=3)
        except Exception:
            pass
    out, err = await asyncio.gather(out_t, err_t)
    truncated = len(out) > OUTPUT_LIMIT or len(err) > OUTPUT_LIMIT
    return proc.returncode, decode_bytes(out[:OUTPUT_LIMIT]), decode_bytes(err[:OUTPUT_LIMIT]), round(time.perf_counter() - start, 4), timed_out, truncated


# ---------------------------------------------------------------- 언어별 준비
def _java_names(code: str) -> Tuple[str, Optional[str]]:
    """(실행할 클래스 이름, 패키지). main 이 들어 있는 클래스를 실행하고, 못 찾으면 public 클래스, 그것도 없으면 Main."""
    code_nc = re.sub(r"//.*|/\*.*?\*/", "", code, flags=re.S)
    pkg = re.search(r"^\s*package\s+([\w.]+)\s*;", code_nc, re.M)
    pub = re.search(r"\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+(\w+)", code_nc)
    main_at = re.search(r"\bstatic\s+void\s+main\s*\(", code_nc)
    main_cls = None
    if main_at:
        before = list(re.finditer(r"\b(?:class|enum|record)\s+(\w+)", code_nc[: main_at.start()]))
        main_cls = before[-1].group(1) if before else None
    return (main_cls or (pub.group(1) if pub else None) or "Main"), (pkg.group(1) if pkg else None)


def java_layout(code: str) -> Tuple[str, str]:
    """(소스 파일 이름, 실행할 클래스 전체 이름). public 클래스는 파일 이름과 같아야 하므로 Main 으로 고정하면 안 된다."""
    main_cls, pkg = _java_names(code)
    pub = re.search(r"\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+(\w+)", re.sub(r"//.*|/\*.*?\*/", "", code, flags=re.S))
    return (pub.group(1) if pub else main_cls) + ".java", (f"{pkg}.{main_cls}" if pkg else main_cls)


_PY_STD = set(getattr(sys, "stdlib_module_names", ())) or {"random", "math", "json", "os", "sys", "re", "time", "string", "typing", "collections", "itertools", "functools", "datetime", "queue",
                                                           "heapq", "bisect", "copy", "io", "csv", "statistics", "fractions", "decimal", "threading", "socket", "types", "test", "code", "email", "select"}
_ENTRY_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}$")
_ENTRY_EXT = {"python": (".py",), "javascript": (".js", ".mjs", ".cjs"), "typescript": (".ts",), "ruby": (".rb",), "php": (".php",), "perl": (".pl",),
              "bash": (".sh", ".bash"), "c": (".c",), "cpp": (".cpp", ".cc", ".cxx"), "csharp": (".cs",), "go": (".go",), "rust": (".rs",)}


def entry_name(lang: str, requested: Optional[str], default: str) -> str:
    """사용자가 연 파일의 진짜 이름(폴더 제외)을 실행 파일 이름으로 쓴다 → 오류 메시지·트레이스백에 내 파일 이름이 그대로 나온다.
    이름이 이상하거나(경로 문자·공백 등) 확장자가 언어와 안 맞거나 실행에 방해되면 기본 이름을 쓴다."""
    name = (requested or "").replace("\\", "/").split("/")[-1].strip()
    if not name or not _ENTRY_RE.match(name) or ".." in name or not name.lower().endswith(_ENTRY_EXT.get(lang, ())):
        return default
    stem = name.rsplit(".", 1)[0]
    if lang == "python" and stem in _PY_STD:   # random.py 처럼 표준 모듈과 같은 이름이면 자기 자신을 import 하게 된다
        return default
    if lang == "go" and (name.endswith("_test.go") or stem.startswith("_")):
        return default
    if lang in ("c", "cpp", "rust", "go", "csharp") and stem in ("prog", "Program") and name != default:
        return default                                    # 실행 파일 이름(prog / Program.exe)과 겹치면 덮어쓴다
    return name


def java_class_mismatch(code: str, file_name: Optional[str]) -> Optional[Tuple[str, str]]:
    """자바는 public 클래스 이름 = 파일 이름이어야 한다. 어긋나면 (public 클래스, 파일 이름 줄기) 를 돌려준다."""
    stem = (file_name or "").replace("\\", "/").split("/")[-1]
    if not stem.lower().endswith(".java"):
        return None
    stem = stem[:-5]
    pub = re.search(r"\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+(\w+)", re.sub(r"//.*|/\*.*?\*/", "", code, flags=re.S))
    return (pub.group(1), stem) if pub and pub.group(1) != stem else None


def csharp_commands(tmp: str, cs_name: str = "Program.cs") -> Tuple[List[str], List[str]]:
    """(컴파일 명령, 실행 명령). Windows csc → Mono(mcs) → .NET SDK(선택한 버전) 순서로 쓸 수 있는 것을 고른다"""
    if CSC:
        return [CSC, "/nologo", "/utf8output", "/out:Program.exe", cs_name], [os.path.join(tmp, "Program.exe")]
    dn = tool("dotnet")
    d = dotnet_info(dn) if dn else None
    if d and dn:
        refs = sorted(glob.glob(os.path.join(d["refdir"], "*.dll")))
        with open(os.path.join(tmp, "refs.rsp"), "w", encoding="utf-8") as f:
            f.write("\n".join("-r:" + r for r in refs) + "\n")
        with open(os.path.join(tmp, "Program.runtimeconfig.json"), "w", encoding="utf-8") as f:
            f.write('{"runtimeOptions":{"tfm":"%s","framework":{"name":"Microsoft.NETCore.App","version":"%s"}}}' % (d["tfm"], d["runtime"]))
        return [dn, d["csc"], "-nologo", "-target:exe", "-out:Program.dll", "@refs.rsp", cs_name], [dn, "Program.dll"]
    if MCS and MONO:
        return [MCS, "-out:Program.exe", cs_name], [MONO, "Program.exe"]
    raise FileNotFoundError("C# 컴파일러")


class LocalSandboxRunner:
    def is_available(self) -> bool:
        return os.path.exists(PYTHON_EXEC)

    def get_supported_languages(self) -> List[str]:
        return [k for k, ok in available().items() if ok]

    # --- 공통: 컴파일 단계 결과를 응답으로 바꾸기
    @staticmethod
    def _compile_fail(label: str, rc, out: str, err: str, timed_out: bool) -> CodeRunResponse:
        if timed_out:
            return CodeRunResponse(status="Compilation Error", error=f"{label} 컴파일 시간이 너무 오래 걸려서 중단했어요.")
        return CodeRunResponse(status="Compilation Error", compile_output=(err or out or "").strip() or f"{label} 컴파일에 실패했어요.", exit_code=rc)

    @staticmethod
    def _result(rc, out, err, elapsed, timed_out, truncated, timeout, mem=20000) -> CodeRunResponse:
        if timed_out:
            return CodeRunResponse(status="Time Limit Exceeded", stdout=out or None, stderr=err or None, error=f"실행 제한 시간({timeout:g}초)을 넘겨서 중단했어요. 무한 반복이 있는지 확인해 보세요.",
                                   execution_time=timeout, exit_code=-1)
        note = "\n… (출력이 너무 길어서 여기까지만 보여줘요)" if truncated else ""
        return CodeRunResponse(status="Accepted" if rc == 0 else "Runtime Error", stdout=((out + note) if out else (note.strip() or None)), stderr=err or None,
                               execution_time=elapsed, memory_used=mem, exit_code=rc)

    async def execute(self, source_code: str, language: str, stdin: str = "", cpu_time_limit: Optional[float] = None, memory_limit: Optional[int] = None,
                      runtime_version: Optional[str] = None) -> CodeRunResponse:
        raw = (language or "").lower().strip()
        lang = ALIASES.get(raw, raw)
        timeout = min(max(0.5, cpu_time_limit or settings.DEFAULT_TIMEOUT_SECONDS), settings.MAX_TIMEOUT_SECONDS)
        mem_kb = min(max(16384, memory_limit or settings.DEFAULT_MEMORY_LIMIT_KB), settings.DEFAULT_MEMORY_LIMIT_KB)
        if lang not in LABELS:
            return CodeRunResponse(status="Error", error=f"지원하지 않는 언어예요: '{language}'. 지금 실행할 수 있는 언어: {', '.join(LABELS[k] for k in self.get_supported_languages())}")
        if not available().get(lang):
            return CodeRunResponse(status="Error", error=f"이 서버에는 {LABELS[lang]} 실행 환경이 설치돼 있지 않아요. 지금 실행할 수 있는 언어: {', '.join(LABELS[k] for k in self.get_supported_languages())}")
        if len(source_code) > 200_000:
            return CodeRunResponse(status="Error", error="코드가 너무 길어요. (최대 20만 자)")
        bad = check_runtime(lang, runtime_version)
        if bad:
            return CodeRunResponse(status="Error", error=bad)
        rt = registry.runtime_for_lang(lang)
        tmp = tempfile.mkdtemp(prefix=f"{lang}_run_")
        try:
            with runtime_override({rt: runtime_version} if (rt and runtime_version) else None):
                return await getattr(self, "_run_" + lang)(source_code, stdin, timeout, mem_kb, tmp)
        except FileNotFoundError as e:
            return CodeRunResponse(status="Error", error=f"실행 도구를 찾지 못했어요: {e.filename or e}")
        except Exception as e:      # 샌드박스 자체의 문제는 서버를 죽이지 않고 알려준다
            return CodeRunResponse(status="Error", error=f"실행 중 문제가 생겼어요: {e}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # --- 인터프리터 언어: 파일로 저장하고 바로 실행
    async def _script(self, tmp, name, code, argv, stdin, timeout):
        with open(os.path.join(tmp, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(code)
        return self._result(*await _run(argv + [name], tmp, stdin, timeout), timeout)

    async def _run_python(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.py", code, [PYTHON_EXEC, "-u", "-B"], stdin, timeout)

    async def _run_javascript(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.js", code, [tool("node")], stdin, timeout)

    async def _run_typescript(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.ts", code, [tool("node")] + (ts_flags(tool("node")) or []), stdin, timeout)

    async def _run_ruby(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.rb", code, [RUBY], stdin, timeout)

    async def _run_php(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.php", code, [PHP], stdin, timeout)

    async def _run_perl(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.pl", code, [PERL], stdin, timeout)

    async def _run_bash(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.sh", code, [BASH], stdin, timeout)

    # --- 컴파일 언어
    async def _compiled(self, tmp, label, compile_argv, run_argv, stdin, timeout, mem=20000):
        rc, out, err, _, to, _ = await _run(compile_argv, tmp, "", COMPILE_TIMEOUT, cpu=int(COMPILE_TIMEOUT))
        if rc != 0 or to:
            return self._compile_fail(label, rc, out, err, to)
        warn = (err or "").strip()
        res = self._result(*await _run(run_argv, tmp, stdin, timeout), timeout, mem)
        if warn and res.status == "Accepted":
            res.compile_output = warn          # 경고는 컴파일 메시지로 따로 보여준다
        return res

    async def _run_c(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "main.c"), "w", encoding="utf-8") as f:
            f.write(code)
        exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
        return await self._compiled(tmp, "C", [GCC, "-O2", "-o", exe, "main.c", "-lm"], [exe], stdin, timeout)

    async def _run_cpp(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "main.cpp"), "w", encoding="utf-8") as f:
            f.write(code)
        exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
        return await self._compiled(tmp, "C++", [GPP, "-O2", "-std=c++17", "-o", exe, "main.cpp"], [exe], stdin, timeout)

    async def _run_java(self, code, stdin, timeout, mem, tmp):
        file_name, full = java_layout(code)
        with open(os.path.join(tmp, file_name), "w", encoding="utf-8") as f:
            f.write(code)
        heap = max(64, min(int(mem / 1024), 512))
        return await self._compiled(tmp, "Java", [tool("javac"), "-encoding", "UTF-8", "-d", ".", file_name],
                                    [tool("java"), f"-Xmx{heap}m", "-XX:+UseSerialGC", "-Xshare:auto", "-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8", "-Dsun.stderr.encoding=UTF-8", "-cp", ".", full],
                                    stdin, timeout, 24500)

    async def _run_csharp(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "Program.cs"), "w", encoding="utf-8") as f:
            f.write(code)
        comp, run = csharp_commands(tmp)
        return await self._compiled(tmp, "C#", comp, run, stdin, timeout, 18200)

    async def _run_go(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "main.go"), "w", encoding="utf-8") as f:
            f.write(code)
        exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
        return await self._compiled(tmp, "Go", [tool("go"), "build", "-o", exe, "main.go"], [exe], stdin, timeout)

    async def _run_rust(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "main.rs"), "w", encoding="utf-8") as f:
            f.write(code)
        exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
        return await self._compiled(tmp, "Rust", [tool("rustc"), "-O", "-o", exe, "main.rs"], [exe], stdin, timeout)


local_sandbox_runner = LocalSandboxRunner()
