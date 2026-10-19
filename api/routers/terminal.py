"""실시간 대화형 터미널 (WebSocket /ws/terminal).

워크스페이스의 '▶ 실행' 버튼: 프로그램이 돌아가는 동안 키보드 입력(input)을 stdin 으로 바로 넘겨 주고, 출력은 실시간으로 흘려보낸다.
통신(클라이언트 → 서버): {action:"start", language, source_code, file_name?, runtime_version?} · {action:"input", data} · {action:"stop"}
통신(서버 → 클라이언트): {type:"stdout"|"stderr", data} · {type:"exit", code, data?}

안전장치 (서버에서 사용자 코드를 직접 돌리는 기능이라 꼭 필요하다):
  · 로그인한 사용자만 쓸 수 있다 (?token=…). PUBLIC_MODE 에서는 꺼진다.
  · 실행되는 코드에는 서버의 환경변수(비밀키·토큰)를 넘기지 않는다.
  · 한 번에 최대 TERMINAL_MAX_SECONDS(기본 5분), 출력 1MB, CPU 시간·파일 크기 제한. 넘으면 프로세스 그룹째 종료한다.
  · 실행 엔진(services/sandbox_runner)을 /api/run 과 같이 쓴다. file_name 을 주면 실제 파일 이름으로 실행하고, 자바는 public 클래스 이름이 파일 이름과 다르면 컴파일 전에 막는다.
"""
import asyncio
import os
import re
import shutil
import tempfile
import time
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from config import settings
from database import async_session_maker
from models import Submission, User
from services import sandbox_runner as sb
from services.auth_service import decode_access_token

router = APIRouter(tags=["Terminal"])
OUT_CAP = 1024 * 1024          # 한 번 실행에서 화면으로 보내는 출력 총량
COMPILE_SECONDS = 25.0


async def _login_user(ws: WebSocket) -> Optional[User]:
    payload = decode_access_token(ws.query_params.get("token", "") or "")
    uid = payload.get("sub") if payload else None
    if not uid or not str(uid).isdigit():
        return None
    async with async_session_maker() as db:
        u = (await db.execute(select(User).where(User.id == int(uid)))).scalar_one_or_none()
    return u if (u and u.is_active and u.withdrawn_at is None) else None


def _script(tmp: str, name: str, code: str, argv: List[str]) -> Tuple[None, List[str]]:
    with open(os.path.join(tmp, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)
    return None, argv + [name]


def _prepare(lang: str, code: str, tmp: str, fname: Optional[str] = None) -> Tuple[Optional[List[str]], List[str]]:
    """(컴파일 명령 또는 None, 실행 명령). 파이프로 연결돼도 프롬프트가 바로 보이도록 출력 버퍼를 끄는 옵션을 붙인다.
    fname = 사용자가 연 파일 이름. 그대로 실행 파일 이름으로 써서 오류 메시지·트레이스백에 내 파일 이름이 나오게 한다."""
    nm = lambda default: sb.entry_name(lang, fname, default)       # noqa: E731
    exe = os.path.join(tmp, "prog.exe" if sb.IS_WINDOWS else "prog")
    unbuf = [shutil.which("stdbuf"), "-o0"] if (shutil.which("stdbuf") and not sb.IS_WINDOWS) else []
    if lang == "python":
        return _script(tmp, nm("main.py"), code, [sb.PYTHON_EXEC, "-u", "-B"])
    if lang == "javascript":
        return _script(tmp, nm("main.js"), code, [sb.tool("node")])
    if lang == "typescript":
        return _script(tmp, nm("main.ts"), code, [sb.tool("node")] + (sb.ts_flags(sb.tool("node")) or []))
    if lang == "ruby":
        rb = nm("main.rb")
        with open(os.path.join(tmp, rb), "w", encoding="utf-8", newline="\n") as f:
            f.write(code)
        return None, [sb.RUBY, "-e", f"$stdout.sync=true; $stderr.sync=true; load './{rb}'"]
    if lang == "php":
        return _script(tmp, nm("main.php"), code, [sb.PHP, "-d", "output_buffering=0", "-d", "implicit_flush=1"])
    if lang == "perl":
        pl = nm("main.pl")
        with open(os.path.join(tmp, pl), "w", encoding="utf-8", newline="\n") as f:
            f.write(code)
        return None, [sb.PERL, "-e", f"$|=1; do './{pl}'; die $@ if $@"]
    if lang == "bash":
        return _script(tmp, nm("main.sh"), code, [sb.BASH])
    if lang in ("c", "cpp"):
        src = nm("main.c" if lang == "c" else "main.cpp")
        with open(os.path.join(tmp, src), "w", encoding="utf-8") as f:
            f.write(code)
        comp = [sb.GCC, "-O2", "-o", exe, src, "-lm"] if lang == "c" else [sb.GPP, "-O2", "-std=c++17", "-o", exe, src]
        return comp, unbuf + [exe]
    if lang == "java":
        file_name, full = sb.java_layout(code)
        stem = (fname or "").replace("\\", "/").split("/")[-1]
        if stem.lower().endswith(".java") and re.match(r"^[A-Za-z_$][\w$]*$", stem[:-5]):
            file_name = stem                    # public 클래스가 없으면 파일 이름이 뭐든 되고, 있으면 아래 start 에서 이름이 같은지 먼저 확인한다
        with open(os.path.join(tmp, file_name), "w", encoding="utf-8") as f:
            f.write(code)
        return [sb.tool("javac"), "-encoding", "UTF-8", "-d", ".", file_name], [sb.tool("java"), "-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8", "-cp", ".", full]
    if lang == "csharp":
        cs = nm("Program.cs")
        with open(os.path.join(tmp, cs), "w", encoding="utf-8") as f:
            f.write(code)
        return sb.csharp_commands(tmp, cs)
    if lang == "go":
        go = nm("main.go")
        with open(os.path.join(tmp, go), "w", encoding="utf-8") as f:
            f.write(code)
        return [sb.tool("go"), "build", "-o", exe, go], [exe]
    if lang == "rust":
        rs = nm("main.rs")
        with open(os.path.join(tmp, rs), "w", encoding="utf-8") as f:
            f.write(code)
        return [sb.tool("rustc"), "-O", "-o", exe, rs], [exe]
    return None, []


@router.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    await websocket.accept()

    async def say(kind: str, data: str, **extra) -> None:
        try:
            await websocket.send_json({"type": kind, "data": data, **extra})
        except Exception:
            pass

    # ---- 문지기: 공유 모드에서는 꺼짐, 로그인한 사용자만
    if settings.PUBLIC_MODE:
        await say("stderr", "공유 모드에서는 보안을 위해 코드 실행이 꺼져 있어요.\n"); await say("exit", "", code=1)
        await websocket.close(code=4403); return
    user = await _login_user(websocket)
    if not user:
        await say("stderr", "코드 실행은 로그인한 뒤에 쓸 수 있어요.\n"); await say("exit", "", code=1)
        await websocket.close(code=4401); return

    state: Dict[str, object] = {"proc": None, "tmp": None, "tasks": [], "sent": 0, "stopped": False,
                                "lang": "", "code": "", "t0": 0.0, "out": "", "err": ""}

    async def record(status: str, exit_code, compile_output: Optional[str] = None) -> None:
        """실행 한 번을 '실행 이력'(submissions)에 남긴다. 실패해도 실행 자체에는 영향이 없다."""
        try:
            async with async_session_maker() as db:
                db.add(Submission(user_id=user.id, language=str(state["lang"]), source_code=str(state["code"]), stdin="",
                                  stdout=(str(state["out"]) or None), stderr=(str(state["err"]) or None), compile_output=compile_output,
                                  status=status, execution_time=round(time.monotonic() - float(state["t0"]), 2) if state["t0"] else None, exit_code=exit_code))
                await db.commit()
        except Exception:
            pass

    def kill_now() -> None:
        proc = state["proc"]
        if proc is not None and proc.returncode is None:
            sb._kill(proc)

    def cleanup() -> None:
        kill_now()
        tmp = state["tmp"]
        if tmp and os.path.exists(tmp):
            shutil.rmtree(tmp, ignore_errors=True)
        state["proc"] = None; state["tmp"] = None

    def drop_tasks() -> None:
        for t in state["tasks"]:
            t.cancel()
        state["tasks"] = []

    async def pipe(stream, kind: str, proc) -> None:
        try:
            while True:
                chunk = await stream.read(1024)
                if not chunk:
                    break
                state["sent"] = int(state["sent"]) + len(chunk)
                if int(state["sent"]) > OUT_CAP:
                    await say("stderr", "\n\x1b[33m[출력이 너무 많아서 실행을 중단했어요]\x1b[0m\n")
                    sb._kill(proc)
                    break
                text = sb.decode_bytes(chunk)
                key = "out" if kind == "stdout" else "err"
                if len(str(state[key])) < 20_000:
                    state[key] = str(state[key]) + text
                await say(kind, text)
        except Exception:
            pass

    async def watch(proc) -> None:
        out_t = asyncio.create_task(pipe(proc.stdout, "stdout", proc)); err_t = asyncio.create_task(pipe(proc.stderr, "stderr", proc))
        limit = max(5, int(settings.TERMINAL_MAX_SECONDS))
        timed_out = False
        try:
            await asyncio.wait_for(proc.wait(), timeout=limit)
        except asyncio.TimeoutError:
            timed_out = True
            sb._kill(proc)
            try:
                await asyncio.wait_for(proc.wait(), timeout=3)
            except Exception:
                pass
        await asyncio.gather(out_t, err_t, return_exceptions=True)
        if state["stopped"]:            # 사용자가 직접 중지한 경우: 중지 안내와 이력 저장은 stop 쪽에서 한다
            return
        code = proc.returncode
        await record("Time Limit Exceeded" if timed_out else ("Accepted" if code == 0 else "Runtime Error"), -1 if timed_out else code)
        if timed_out:
            text = f"\n\x1b[31m[실행 시간({limit}초)을 넘겨서 중단했어요]\x1b[0m\n"
        elif code == 0:
            text = "\n\x1b[32m[프로그램 정상 종료]\x1b[0m\n"
        elif code is not None and code < 0:
            text = f"\n\x1b[31m[프로그램이 강제로 종료됐어요 (신호 {-code})]\x1b[0m\n"
        else:
            text = f"\n\x1b[31m[프로그램 종료 (코드: {code})]\x1b[0m\n"
        await say("exit", text, code=code if not timed_out else -1)

    try:
        while True:
            msg = await websocket.receive_json()
            action = msg.get("action")

            if action == "start":
                drop_tasks(); cleanup(); state["sent"] = 0; state["stopped"] = False; state["out"] = ""; state["err"] = ""
                raw = (msg.get("language") or "python").lower().strip()
                lang = sb.ALIASES.get(raw, raw)
                code = msg.get("source_code") or ""
                if lang not in sb.LABELS or not sb.available().get(lang):
                    names = ", ".join(sb.LABELS[k] for k in sb.LocalSandboxRunner().get_supported_languages())
                    await say("stderr", f"이 서버에서는 '{raw}' 를 실행할 수 없어요. 실행 가능: {names}\n"); await say("exit", "", code=1)
                    continue
                if len(code) > 200_000:
                    await say("stderr", "코드가 너무 길어요. (최대 20만 자)\n"); await say("exit", "", code=1)
                    continue
                fname = str(msg.get("file_name") or "")[:200] or None
                state["lang"] = lang; state["code"] = code; state["t0"] = time.monotonic()
                if lang == "java":                 # 자바: public 클래스 이름 = 파일 이름. 어긋나면 컴파일하지 않고 바로 알려 준다 (javac 와 같은 규칙)
                    mm = sb.java_class_mismatch(code, fname)
                    if mm:
                        await record("Compilation Error", 1, f"class {mm[0]} is public, should be declared in a file named {mm[0]}.java")
                        await say("stderr", f"\x1b[31m[컴파일 에러]\n{fname.split('/')[-1]}: error: class {mm[0]} is public, should be declared in a file named {mm[0]}.java\n"
                                            f"→ 파일 이름({mm[1]}.java)과 public 클래스 이름({mm[0]})이 달라요. 둘 중 하나를 같게 맞춰 주세요.\x1b[0m\n")
                        await say("exit", "", code=1)
                        continue
                rv = str(msg.get("runtime_version") or "")[:40] or None            # 사용자가 고른 버전 (없으면 서버 기본 버전)
                bad = sb.check_runtime(lang, rv)
                if bad:
                    await say("stderr", bad + "\n"); await say("exit", "", code=1)
                    continue
                rt = sb.registry.runtime_for_lang(lang)
                tmp = tempfile.mkdtemp(prefix="cl_term_"); state["tmp"] = tmp
                with sb.runtime_override({rt: rv} if (rt and rv) else None):
                    env = sb._clean_env(tmp); env["PYTHONUNBUFFERED"] = "1"
                    comp, run = _prepare(lang, code, tmp, fname)
                if comp:
                    await say("stdout", f"\x1b[36m[{sb.LABELS[lang]} 컴파일 중...]\x1b[0m\n")
                    try:
                        kw = {} if sb.IS_WINDOWS else {"start_new_session": True}
                        cp = await asyncio.create_subprocess_exec(*comp, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=tmp, env=env, **kw)
                        c_out, c_err = await asyncio.wait_for(cp.communicate(), timeout=COMPILE_SECONDS)
                    except asyncio.TimeoutError:
                        sb._kill(cp)
                        await say("stderr", "\x1b[31m[컴파일 시간이 너무 오래 걸려서 중단했어요]\x1b[0m\n"); await say("exit", "", code=1)
                        continue
                    if cp.returncode != 0:
                        err = sb.decode_bytes(c_err) or sb.decode_bytes(c_out)
                        await record("Compilation Error", cp.returncode, err[:20_000])
                        await say("stderr", f"\x1b[31m[컴파일 에러]\n{err}\x1b[0m\n"); await say("exit", "", code=cp.returncode)
                        continue
                try:
                    kw = {}
                    if not sb.IS_WINDOWS:
                        kw = {"start_new_session": True, "preexec_fn": sb._limits(int(settings.TERMINAL_MAX_SECONDS) + 5)}
                    proc = await asyncio.create_subprocess_exec(*run, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=tmp, env=env, **kw)
                except Exception as e:
                    await say("stderr", f"\x1b[31m실행 실패: {e}\x1b[0m\n"); await say("exit", "", code=1)
                    continue
                state["proc"] = proc
                state["tasks"].append(asyncio.create_task(watch(proc)))

            elif action == "input":
                proc = state["proc"]
                if proc is not None and proc.stdin and proc.returncode is None:
                    data = str(msg.get("data", ""))[:4096]           # 한 번에 너무 큰 입력은 자른다
                    try:
                        proc.stdin.write(data.encode("utf-8"))
                        await proc.stdin.drain()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass

            elif action == "stop":
                running = state["proc"] is not None and state["proc"].returncode is None and not state["stopped"]
                state["stopped"] = True
                kill_now()
                if running:
                    await record("Stopped", -1)
                await say("exit", "\n\x1b[33m[사용자에 의해 강제 중단됨]\x1b[0m\n", code=-1)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        drop_tasks()
        cleanup()
