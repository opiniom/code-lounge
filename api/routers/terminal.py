import os
import sys
import shutil
import asyncio
import tempfile
import subprocess
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.sandbox_runner import PYTHON_EXEC, JAVAC, JAVA, CSC, GCC, GPP

JAVAC_EXEC = JAVAC
JAVA_EXEC = JAVA
CSC_EXEC = CSC
GCC_EXEC = GCC
GPP_EXEC = GPP

def decode_bytes(data: bytes) -> str:
    if not data:
        return ""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    try:
        return data.decode("cp949")
    except UnicodeDecodeError:
        pass
    return data.decode("utf-8", errors="replace")

router = APIRouter(tags=["Terminal"])

@router.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    await websocket.accept()
    current_process: Optional[asyncio.subprocess.Process] = None
    temp_dir: Optional[str] = None
    stream_tasks = []

    def cleanup_process():
        nonlocal current_process, temp_dir
        if current_process and current_process.returncode is None:
            try:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(current_process.pid)], capture_output=True)
                else:
                    current_process.kill()
            except Exception:
                try:
                    current_process.kill()
                except Exception:
                    pass
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

    try:
        while True:
            raw_msg = await websocket.receive_json()
            action = raw_msg.get("action")

            if action == "start":
                # 기존 프로세스가 있다면 정리
                cleanup_process()
                for t in stream_tasks:
                    t.cancel()
                stream_tasks.clear()

                language = (raw_msg.get("language") or "python").lower()
                source_code = raw_msg.get("source_code") or ""
                temp_dir = tempfile.mkdtemp(prefix="cl_term_")

                cmd = []
                py_env = os.environ.copy()
                py_env["PYTHONIOENCODING"] = "utf-8"
                py_env["PYTHONUNBUFFERED"] = "1"
                py_env["PYTHONUTF8"] = "1"

                compile_failed = False

                if language == "python":
                    script_path = os.path.join(temp_dir, "solution.py")
                    with open(script_path, "w", encoding="utf-8") as f:
                        f.write(source_code)
                    cmd = [PYTHON_EXEC, "-u", "-B", script_path]

                elif language in ("c", "cpp"):
                    ext = "cpp" if language == "cpp" else "c"
                    compiler = GPP_EXEC if language == "cpp" else GCC_EXEC
                    if not compiler:
                        await websocket.send_json({"type": "stderr", "data": "C/C++ 컴파일러(gcc/g++)가 설치되어 있지 않습니다.\r\n"})
                        await websocket.send_json({"type": "exit", "code": 1})
                        continue

                    src_path = os.path.join(temp_dir, f"solution.{ext}")
                    out_path = os.path.join(temp_dir, "solution.exe" if os.name == "nt" else "solution")
                    with open(src_path, "w", encoding="utf-8") as f:
                        f.write(source_code)

                    await websocket.send_json({"type": "stdout", "data": "\x1b[36m[컴파일 중...]\x1b[0m\r\n"})
                    comp_proc = await asyncio.create_subprocess_exec(
                        compiler, src_path, "-o", out_path,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=temp_dir
                    )
                    c_out, c_err = await comp_proc.communicate()
                    if comp_proc.returncode != 0:
                        err_text = decode_bytes(c_err) or decode_bytes(c_out)
                        await websocket.send_json({"type": "stderr", "data": f"\x1b[31m[컴파일 에러]\r\n{err_text}\x1b[0m\r\n"})
                        await websocket.send_json({"type": "exit", "code": comp_proc.returncode})
                        compile_failed = True
                    else:
                        cmd = [out_path]

                elif language == "csharp":
                    if not os.path.exists(CSC_EXEC):
                        await websocket.send_json({"type": "stderr", "data": "C# 컴파일러(csc.exe)를 찾을 수 없습니다.\r\n"})
                        await websocket.send_json({"type": "exit", "code": 1})
                        continue

                    src_path = os.path.join(temp_dir, "Program.cs")
                    out_path = os.path.join(temp_dir, "Program.exe")
                    with open(src_path, "w", encoding="utf-8") as f:
                        f.write(source_code)

                    await websocket.send_json({"type": "stdout", "data": "\x1b[36m[C# 컴파일 중...]\x1b[0m\r\n"})
                    comp_proc = await asyncio.create_subprocess_exec(
                        CSC_EXEC, "/nologo", f"/out:{out_path}", src_path,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=temp_dir
                    )
                    c_out, c_err = await comp_proc.communicate()
                    if comp_proc.returncode != 0:
                        err_text = decode_bytes(c_out) or decode_bytes(c_err)
                        await websocket.send_json({"type": "stderr", "data": f"\x1b[31m[C# 컴파일 에러]\r\n{err_text}\x1b[0m\r\n"})
                        await websocket.send_json({"type": "exit", "code": comp_proc.returncode})
                        compile_failed = True
                    else:
                        cmd = [out_path]

                elif language == "java":
                    if not JAVAC_EXEC or not shutil.which("javac"):
                        await websocket.send_json({"type": "stderr", "data": "Java 컴파일러(javac)를 찾을 수 없습니다.\r\n"})
                        await websocket.send_json({"type": "exit", "code": 1})
                        continue

                    src_path = os.path.join(temp_dir, "Main.java")
                    with open(src_path, "w", encoding="utf-8") as f:
                        f.write(source_code)

                    await websocket.send_json({"type": "stdout", "data": "\x1b[36m[Java 컴파일 중...]\x1b[0m\r\n"})
                    comp_proc = await asyncio.create_subprocess_exec(
                        JAVAC_EXEC, "-encoding", "UTF-8", src_path,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=temp_dir
                    )
                    c_out, c_err = await comp_proc.communicate()
                    if comp_proc.returncode != 0:
                        err_text = decode_bytes(c_err) or decode_bytes(c_out)
                        await websocket.send_json({"type": "stderr", "data": f"\x1b[31m[Java 컴파일 에러]\r\n{err_text}\x1b[0m\r\n"})
                        await websocket.send_json({"type": "exit", "code": comp_proc.returncode})
                        compile_failed = True
                    else:
                        java_bin = JAVA_EXEC or "java"
                        cmd = [java_bin, "-Dfile.encoding=UTF-8", "Main"]

                if compile_failed:
                    continue

                if not cmd:
                    await websocket.send_json({"type": "stderr", "data": f"지원하지 않는 언어입니다: {language}\r\n"})
                    await websocket.send_json({"type": "exit", "code": 1})
                    continue

                # 비동기 대화형 서브프로세스 생성 (Unbuffered I/O)
                try:
                    current_process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=temp_dir,
                        env=py_env
                    )
                except Exception as e:
                    await websocket.send_json({"type": "stderr", "data": f"\x1b[31m실행 실패: {str(e)}\x1b[0m\r\n"})
                    await websocket.send_json({"type": "exit", "code": 1})
                    continue

                # stdout 및 stderr 비동기 스트리밍 태스크 정의
                async def pipe_stream(stream, msg_type):
                    try:
                        while True:
                            # 1024바이트씩 즉시 읽기 (개행 대기 없이 프롬프트 즉시 출력)
                            chunk = await stream.read(1024)
                            if not chunk:
                                break
                            text = decode_bytes(chunk)
                            # CR-LF 변환 (웹 터미널 줄바꿈 일치)
                            normalized = text.replace("\r\n", "\n").replace("\n", "\r\n")
                            await websocket.send_json({"type": msg_type, "data": normalized})
                    except Exception:
                        pass

                async def watch_process(proc):
                    stdout_task = asyncio.create_task(pipe_stream(proc.stdout, "stdout"))
                    stderr_task = asyncio.create_task(pipe_stream(proc.stderr, "stderr"))
                    await proc.wait()
                    await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
                    exit_code = proc.returncode
                    status_text = "\x1b[32m[프로그램 정상 종료]\x1b[0m" if exit_code == 0 else f"\x1b[31m[프로그램 종료 (코드: {exit_code})]\x1b[0m"
                    await websocket.send_json({
                        "type": "exit",
                        "code": exit_code,
                        "data": f"\r\n{status_text}\r\n"
                    })

                watcher = asyncio.create_task(watch_process(current_process))
                stream_tasks.append(watcher)

            elif action == "input":
                # 클라이언트가 타이핑한 키보드 입력값을 stdin으로 전달
                if current_process and current_process.stdin and current_process.returncode is None:
                    data = raw_msg.get("data", "")
                    try:
                        current_process.stdin.write(data.encode("utf-8"))
                        await current_process.stdin.drain()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass

            elif action == "stop":
                cleanup_process()
                await websocket.send_json({
                    "type": "exit",
                    "code": -1,
                    "data": "\r\n\x1b[33m[사용자에 의해 강제 중단됨]\x1b[0m\r\n"
                })

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        cleanup_process()
        for t in stream_tasks:
            t.cancel()
