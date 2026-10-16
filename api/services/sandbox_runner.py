"""로컬 코드 실행 샌드박스.

 · 서버에 설치된 도구를 자동으로 찾아서, 쓸 수 있는 언어만 지원 목록(/health)에 올린다.
   Python · JavaScript · TypeScript · Java · C · C++ · C# · Ruby · PHP · Perl · Bash · Go · Rust
 · 없는 도구는 가짜 결과를 만들지 않고 "이 서버에는 ○○가 설치돼 있지 않아요" 라고 솔직하게 알린다.
 · 실행 코드는 임시 폴더에서만 돌고, 서버의 환경변수(비밀키·토큰)는 넘겨주지 않는다.
 · 시간 제한 · 출력 크기 제한 · (POSIX) CPU/파일 크기 제한 · 프로세스 그룹 통째로 종료.
주의: 이 샌드박스는 컨테이너/VM 같은 완전한 격리가 아니다. 공개 서버에서는 PUBLIC_MODE 로 끄거나 Judge0 같은 별도 격리 환경을 쓰는 것을 권장한다.
"""
import asyncio
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
NODE = shutil.which("node")
RUBY = shutil.which("ruby")
PHP = shutil.which("php")
PERL = shutil.which("perl")
BASH = shutil.which("bash")
GO = shutil.which("go")
RUSTC = shutil.which("rustc")
JAVAC = shutil.which("javac")
JAVA = shutil.which("java")
GCC = shutil.which("gcc") or shutil.which("clang")
GPP = shutil.which("g++") or shutil.which("clang++")
MCS = shutil.which("mcs")
MONO = shutil.which("mono")
CSC = next((p for p in (r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe", r"C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe") if os.path.exists(p)), None) if IS_WINDOWS else None


def _node_ts_flags() -> Optional[List[str]]:
    """Node 가 TypeScript 를 직접 실행할 수 있으면 필요한 옵션 목록(없으면 []), 못 하면 None"""
    if not NODE:
        return None
    try:
        v = subprocess.run([NODE, "--version"], capture_output=True, text=True, timeout=5).stdout.strip().lstrip("v")
        major, minor = (int(x) for x in v.split(".")[:2])
    except Exception:
        return None
    if major > 23 or (major == 23 and minor >= 6) or (major == 22 and minor >= 18):
        return []
    if major == 22 and minor >= 6:
        return ["--experimental-strip-types"]
    return None


TS_FLAGS = _node_ts_flags()

# 화면에 보여줄 이름
LABELS = {"python": "Python", "javascript": "JavaScript", "typescript": "TypeScript", "java": "Java", "c": "C", "cpp": "C++", "csharp": "C#",
          "ruby": "Ruby", "php": "PHP", "perl": "Perl", "bash": "Bash", "go": "Go", "rust": "Rust"}
ALIASES = {"py": "python", "python3": "python", "js": "javascript", "node": "javascript", "nodejs": "javascript", "ts": "typescript", "c++": "cpp", "cc": "cpp",
           "cs": "csharp", "c#": "csharp", "rb": "ruby", "sh": "bash", "shell": "bash", "golang": "go", "rs": "rust", "pl": "perl"}


def available() -> Dict[str, bool]:
    return {
        "python": os.path.exists(PYTHON_EXEC), "javascript": bool(NODE), "typescript": TS_FLAGS is not None, "java": bool(JAVAC and JAVA),
        "c": bool(GCC), "cpp": bool(GPP), "csharp": bool(CSC or (MCS and MONO)), "ruby": bool(RUBY), "php": bool(PHP), "perl": bool(PERL),
        "bash": bool(BASH) and not IS_WINDOWS, "go": bool(GO), "rust": bool(RUSTC),
    }


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
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": workdir, "TMPDIR": workdir, "TEMP": workdir, "TMP": workdir,
           "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1",
           "GOCACHE": os.path.join(workdir, ".gocache"), "GOPATH": os.path.join(workdir, ".gopath"), "GOFLAGS": "-mod=mod", "NO_COLOR": "1"}
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

    async def execute(self, source_code: str, language: str, stdin: str = "", cpu_time_limit: Optional[float] = None, memory_limit: Optional[int] = None) -> CodeRunResponse:
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
        tmp = tempfile.mkdtemp(prefix=f"{lang}_run_")
        try:
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
        return await self._script(tmp, "main.js", code, [NODE], stdin, timeout)

    async def _run_typescript(self, code, stdin, timeout, mem, tmp):
        return await self._script(tmp, "main.ts", code, [NODE] + (TS_FLAGS or []), stdin, timeout)

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
        main_cls, pkg = _java_names(code)
        pub = re.search(r"\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+(\w+)", re.sub(r"//.*|/\*.*?\*/", "", code, flags=re.S))
        file_name = (pub.group(1) if pub else main_cls) + ".java"       # public 클래스는 파일 이름과 같아야 한다 (Main 으로 고정하면 다른 이름은 컴파일 에러)
        with open(os.path.join(tmp, file_name), "w", encoding="utf-8") as f:
            f.write(code)
        full = f"{pkg}.{main_cls}" if pkg else main_cls
        heap = max(64, min(int(mem / 1024), 512))
        return await self._compiled(tmp, "Java", [JAVAC, "-encoding", "UTF-8", "-d", ".", file_name],
                                    [JAVA, f"-Xmx{heap}m", "-XX:+UseSerialGC", "-Xshare:auto", "-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8", "-Dsun.stderr.encoding=UTF-8", "-cp", ".", full],
                                    stdin, timeout, 24500)

    async def _run_csharp(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "Program.cs"), "w", encoding="utf-8") as f:
            f.write(code)
        if CSC:
            return await self._compiled(tmp, "C#", [CSC, "/nologo", "/utf8output", "/out:Program.exe", "Program.cs"], [os.path.join(tmp, "Program.exe")], stdin, timeout, 18200)
        return await self._compiled(tmp, "C#", [MCS, "-out:Program.exe", "Program.cs"], [MONO, "Program.exe"], stdin, timeout, 18200)

    async def _run_go(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "main.go"), "w", encoding="utf-8") as f:
            f.write(code)
        exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
        return await self._compiled(tmp, "Go", [GO, "build", "-o", exe, "main.go"], [exe], stdin, timeout)

    async def _run_rust(self, code, stdin, timeout, mem, tmp):
        with open(os.path.join(tmp, "main.rs"), "w", encoding="utf-8") as f:
            f.write(code)
        exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
        return await self._compiled(tmp, "Rust", [RUSTC, "-O", "-o", exe, "main.rs"], [exe], stdin, timeout)


local_sandbox_runner = LocalSandboxRunner()
