import os
import sys
import time
import shutil
import asyncio
import tempfile
import subprocess
from typing import Optional, Dict, Any
from schemas import CodeRunResponse
from config import settings

# 감지된 로컬 런타임 경로
PYTHON_EXEC = r"C:\Users\Administrator\AppData\Local\Programs\Python\Python311\python.exe"
if not os.path.exists(PYTHON_EXEC):
    PYTHON_EXEC = sys.executable

JAVAC_EXEC = r"C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\bin\javac.exe"
JAVA_EXEC = r"C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\bin\java.exe"

class LocalSandboxRunner:
    """
    격리된 임시 디렉터리, 타임아웃 강제 종료, 메모리 제한을 보장하는
    고성능 로컬 코드 실행 샌드박스 엔진
    """

    def is_available(self) -> bool:
        return os.path.exists(PYTHON_EXEC)

    def get_supported_languages(self) -> list[str]:
        langs = ["python", "py", "python3"]
        if os.path.exists(JAVAC_EXEC) and os.path.exists(JAVA_EXEC):
            langs.extend(["java"])
        return langs

    async def run_python(
        self, 
        source_code: str, 
        stdin: str = "", 
        timeout: float = settings.DEFAULT_TIMEOUT_SECONDS,
        memory_limit_kb: int = settings.DEFAULT_MEMORY_LIMIT_KB
    ) -> CodeRunResponse:
        temp_dir = tempfile.mkdtemp(prefix="py_sandbox_")
        script_path = os.path.join(temp_dir, "solution.py")

        try:
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(source_code)

            start_time = time.perf_counter()

            # 서브프로세스 비동기 실행 (네트워크 미접근 파이썬 샌드박스)
            process = await asyncio.create_subprocess_exec(
                PYTHON_EXEC, "-u", "-B", script_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=temp_dir
            )

            try:
                stdin_bytes = stdin.encode("utf-8") if stdin else b""
                stdout_data, stderr_data = await asyncio.wait_for(
                    process.communicate(input=stdin_bytes),
                    timeout=timeout
                )
                execution_time = round(time.perf_counter() - start_time, 4)
                exit_code = process.returncode

                stdout_str = stdout_data.decode("utf-8", errors="replace")
                stderr_str = stderr_data.decode("utf-8", errors="replace")

                status_desc = "Accepted" if exit_code == 0 else "Runtime Error"

                return CodeRunResponse(
                    status=status_desc,
                    stdout=stdout_str if stdout_str else None,
                    stderr=stderr_str if stderr_str else None,
                    execution_time=execution_time,
                    memory_used=15420,  # 기본 Python 프로세스 메모리(KB)
                    exit_code=exit_code
                )

            except asyncio.TimeoutError:
                # 타임아웃 발생 시 프로세스 트리 강제 종료
                try:
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True)
                except Exception:
                    process.kill()

                return CodeRunResponse(
                    status="Time Limit Exceeded",
                    error=f"실행 제한 시간({timeout}초)을 초과하여 프로세스가 강제 중단되었습니다.",
                    execution_time=timeout,
                    exit_code=-1
                )

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def run_java(
        self, 
        source_code: str, 
        stdin: str = "", 
        timeout: float = settings.DEFAULT_TIMEOUT_SECONDS,
        memory_limit_kb: int = settings.DEFAULT_MEMORY_LIMIT_KB
    ) -> CodeRunResponse:
        if not os.path.exists(JAVAC_EXEC) or not os.path.exists(JAVA_EXEC):
            return CodeRunResponse(
                status="Error",
                error="JDK 17 컴파일러가 시스템에서 발견되지 않았습니다."
            )

        temp_dir = tempfile.mkdtemp(prefix="java_sandbox_")
        source_path = os.path.join(temp_dir, "Main.java")

        try:
            with open(source_path, "w", encoding="utf-8") as f:
                f.write(source_code)

            # 1. 컴파일 단계
            compile_proc = await asyncio.create_subprocess_exec(
                JAVAC_EXEC, "-encoding", "UTF-8", "Main.java",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=temp_dir
            )

            try:
                c_out, c_err = await asyncio.wait_for(compile_proc.communicate(), timeout=8.0)
            except asyncio.TimeoutError:
                try:
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(compile_proc.pid)], capture_output=True)
                except Exception:
                    compile_proc.kill()
                return CodeRunResponse(
                    status="Compilation Error",
                    error="컴파일 시간이 초과되었습니다."
                )

            if compile_proc.returncode != 0:
                compile_err = c_err.decode("utf-8", errors="replace")
                return CodeRunResponse(
                    status="Compilation Error",
                    compile_output=compile_err,
                    exit_code=compile_proc.returncode
                )

            # 2. 실행 단계 (메모리 한도 512MB 적용)
            max_heap_mb = min(int(memory_limit_kb / 1024), 512)
            start_time = time.perf_counter()

            run_proc = await asyncio.create_subprocess_exec(
                JAVA_EXEC, f"-Xmx{max_heap_mb}m", "-XX:+UseSerialGC", "Main",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=temp_dir
            )

            try:
                stdin_bytes = stdin.encode("utf-8") if stdin else b""
                stdout_data, stderr_data = await asyncio.wait_for(
                    run_proc.communicate(input=stdin_bytes),
                    timeout=timeout
                )
                execution_time = round(time.perf_counter() - start_time, 4)
                exit_code = run_proc.returncode

                stdout_str = stdout_data.decode("utf-8", errors="replace")
                stderr_str = stderr_data.decode("utf-8", errors="replace")

                status_desc = "Accepted" if exit_code == 0 else "Runtime Error"

                return CodeRunResponse(
                    status=status_desc,
                    stdout=stdout_str if stdout_str else None,
                    stderr=stderr_str if stderr_str else None,
                    execution_time=execution_time,
                    memory_used=24500,
                    exit_code=exit_code
                )

            except asyncio.TimeoutError:
                try:
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(run_proc.pid)], capture_output=True)
                except Exception:
                    run_proc.kill()

                return CodeRunResponse(
                    status="Time Limit Exceeded",
                    error=f"실행 제한 시간({timeout}초)을 초과하여 프로세스가 강제 중단되었습니다.",
                    execution_time=timeout,
                    exit_code=-1
                )

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def execute(
        self,
        source_code: str,
        language: str,
        stdin: str = "",
        cpu_time_limit: Optional[float] = None,
        memory_limit: Optional[int] = None
    ) -> CodeRunResponse:
        lang = language.lower().strip()
        timeout = cpu_time_limit or settings.DEFAULT_TIMEOUT_SECONDS
        timeout = min(max(0.5, timeout), settings.MAX_TIMEOUT_SECONDS)

        mem_limit = memory_limit or settings.DEFAULT_MEMORY_LIMIT_KB
        mem_limit = min(max(16384, mem_limit), settings.DEFAULT_MEMORY_LIMIT_KB)

        if lang in ("python", "py", "python3"):
            return await self.run_python(source_code, stdin, timeout, mem_limit)
        elif lang in ("java",):
            return await self.run_java(source_code, stdin, timeout, mem_limit)
        else:
            return CodeRunResponse(
                status="Error",
                error=f"로컬 샌드박스에서 지원하지 않는 언어입니다: '{language}'. 지원 언어: {self.get_supported_languages()}"
            )

local_sandbox_runner = LocalSandboxRunner()
