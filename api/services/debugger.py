"""워크스페이스 디버거 — 중단점 · 한 줄씩 실행 · 변수 보기.

서버에서 실행하는 세 언어를 지원한다:
  · 파이썬      : 표준 라이브러리 bdb 하네스(dbg_py_harness.py)를 파이프(fd)로 제어
  · 자바스크립트: node --inspect-brk + 크롬 개발자 도구 프로토콜(CDP, 웹소켓)
  · 자바        : JDWP 로 띄운 프로그램에 jdb 를 붙여서(attach) 제어 — 프로그램의 표준 입출력은 평소 실행과 똑같이 따로 흐른다

세션 객체는 터미널 웹소켓(routers/terminal.py) 안에서만 쓰인다:
  s = create(lang, tmp, fname, code, bps, emit)   # 파일을 쓰고 실행 명령을 만든다 (comp: 컴파일 명령 또는 None, run: 실행 명령)
  proc = (터미널이 프로그램을 띄움, s.spawn_kwargs 를 함께 넘긴다)
  await s.attach(proc)                              # 디버거를 붙인다
  await s.command("next" 등)                        # 사용자가 누른 버튼
  s.filter(kind, text)                              # 디버거가 만든 안내 줄(Listening for …)은 사용자 화면에서 뺀다
  s.close()
emit({...}) 로 화면에 보내는 메시지: {"ev":"ready"} · {"ev":"paused", line, func, reason, vars, stack, note} · {"ev":"running"} · {"ev":"notice", text}
"""
import asyncio
import json
import os
import re
import shutil
import socket
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import services.sandbox_runner as sb

SUPPORTED = ("python", "javascript", "java")
MAX_SESSIONS = 3                 # 서버 전체에서 동시에 열 수 있는 디버그 수 (서버 메모리가 작아서 제한)
IDLE_SECONDS = 300               # 멈춘 채로 아무 조작이 없으면 이 시간 뒤에 정리
WALL_SECONDS = 900               # 디버그 한 번의 최대 시간 (평소 실행보다 길게)
_active = 0


def acquire() -> bool:
    global _active
    if _active >= MAX_SESSIONS:
        return False
    _active += 1
    return True


def release() -> None:
    global _active
    _active = max(0, _active - 1)


def supported(lang: str) -> bool:
    return (not sb.IS_WINDOWS) and lang in SUPPORTED


def _write(tmp: str, name: str, code: str) -> None:
    with open(os.path.join(tmp, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Session:
    kind = ""

    def __init__(self, tmp: str, fname: Optional[str], code: str, bps: List[int], emit: Callable[[Dict[str, Any]], Any]):
        self.tmp, self.fname, self.code, self.bps, self.emit = tmp, fname, code, bps, emit
        self.comp: Optional[List[str]] = None
        self.run: List[str] = []
        self.spawn_kwargs: Dict[str, Any] = {}
        self.paused = False
        self.last = time.monotonic()
        self.tasks: List[asyncio.Task] = []
        self.closed = False

    # 터미널이 호출 -------------------------------------------------------
    def filter(self, kind: str, text: str) -> str:
        return text

    async def attach(self, proc) -> None:
        raise NotImplementedError

    async def command(self, cmd: str, msg: Dict[str, Any]) -> None:
        raise NotImplementedError

    def idle_expired(self) -> bool:
        return self.paused and (time.monotonic() - self.last) > IDLE_SECONDS

    def touch(self) -> None:
        self.last = time.monotonic()

    def close(self) -> None:
        self.closed = True
        for t in self.tasks:
            t.cancel()
        self.tasks = []

    # 보조 ------------------------------------------------------------------
    async def _emit(self, **ev) -> None:
        r = self.emit({"type": "dbg", **ev})
        if asyncio.iscoroutine(r):
            await r


# ======================================================================
# 파이썬
# ======================================================================
class PySession(Session):
    kind = "python"

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        name = sb.entry_name("python", self.fname, "main.py")
        _write(self.tmp, name, self.code)
        r_evt, w_evt = os.pipe()
        r_cmd, w_cmd = os.pipe()
        os.set_inheritable(w_evt, True)
        os.set_inheritable(r_cmd, True)
        self.r_evt, self.w_evt, self.r_cmd, self.w_cmd = r_evt, w_evt, r_cmd, w_cmd
        harness = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dbg_py_harness.py")
        self.run = [sb.PYTHON_EXEC, "-u", "-B", harness, str(w_evt), str(r_cmd), name, json.dumps(self.bps)]
        self.spawn_kwargs = {"pass_fds": (w_evt, r_cmd)}
        self.cmd_file = None
        self.attached = False

    async def attach(self, proc) -> None:
        self.attached = True
        os.close(self.w_evt)            # 자식에게 넘긴 끝은 이쪽에서 닫는다
        os.close(self.r_cmd)
        self.cmd_file = os.fdopen(self.w_cmd, "w", encoding="utf-8", buffering=1)
        loop = asyncio.get_running_loop()
        reader = asyncio.StreamReader()
        await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), os.fdopen(self.r_evt, "rb", 0))
        self.tasks.append(asyncio.create_task(self._events(reader)))

    async def _events(self, reader) -> None:
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                try:
                    ev = json.loads(line.decode("utf-8", "replace"))
                except ValueError:
                    continue
                if ev.get("ev") == "paused":
                    self.paused = True; self.touch()
                elif ev.get("ev") == "running":
                    self.paused = False
                await self._emit(**ev)
        except Exception:
            pass

    async def command(self, cmd: str, msg: Dict[str, Any]) -> None:
        self.touch()
        if cmd != "breakpoints" and not self.paused:
            return                                      # 달리는 중에 온 한 줄 실행 등은 무시 (명령이 쌓이지 않게)
        payload: Dict[str, Any] = {"cmd": cmd}
        if cmd == "breakpoints":
            payload["lines"] = [int(x) for x in (msg.get("lines") or [])][:100]
        elif cmd not in ("continue", "next", "step", "out", "stop"):
            return
        if cmd != "breakpoints":
            self.paused = False
        try:
            self.cmd_file.write(json.dumps(payload) + "\n"); self.cmd_file.flush()
        except Exception:
            pass

    def close(self) -> None:
        super().close()
        try:
            if self.cmd_file:
                self.cmd_file.close()
            if not self.attached:                       # 프로그램을 띄우기 전에 끝난 경우 파이프를 모두 닫는다
                for fd in (self.r_evt, self.w_evt, self.r_cmd, self.w_cmd):
                    try:
                        os.close(fd)
                    except OSError:
                        pass
        except Exception:
            pass


# ======================================================================
# 자바스크립트 (node inspector)
# ======================================================================
_NODE_NOISE = re.compile(r"^(Debugger listening on ws://\S+|Debugger attached\.|For help, see: \S+|Waiting for the debugger to disconnect\.\.\.)\r?\n", re.M)
_NODE_URL = re.compile(r"ws://127\.0\.0\.1:\d+/[0-9a-fA-F-]+")


def _fmt_remote(ro: Dict[str, Any]) -> Tuple[str, str]:
    """CDP RemoteObject → (종류, 짧은 값)"""
    t = ro.get("type", "")
    sub = ro.get("subtype")
    if t == "undefined":
        return "undefined", "undefined"
    if sub == "null":
        return "null", "null"
    if t == "string":
        s = ro.get("value", "")
        return "string", json.dumps(s, ensure_ascii=False)[:200]
    if t in ("number", "boolean", "bigint"):
        v = ro.get("unserializableValue") or ro.get("value")
        return t, str(v).lower() if t == "boolean" else str(v)
    if t == "function":
        return "function", (ro.get("description") or "function")[:60].split("\n")[0]
    pv = ro.get("preview")
    desc = (ro.get("description") or sub or "Object")[:80]
    if pv and pv.get("properties") is not None:
        props = pv["properties"]
        if sub == "array":
            body = ", ".join(_prev_val(p) for p in props[:12])
            return desc.split("(")[0] or "Array", "[" + body + (", …" if pv.get("overflow") else "") + "]"
        body = ", ".join("%s: %s" % (p.get("name"), _prev_val(p)) for p in props[:10])
        return (sub or "Object"), "{" + body + (", …" if pv.get("overflow") else "") + "}"
    return (sub or "Object"), desc


def _prev_val(p: Dict[str, Any]) -> str:
    t = p.get("type")
    v = p.get("value")
    if t == "string":
        return json.dumps(v, ensure_ascii=False)[:40]
    if t == "object" and v == "null":
        return "null"
    if t in ("object", "function"):
        return (p.get("valuePreview") or {}).get("description") or p.get("subtype") or str(v)
    return str(v)


class NodeSession(Session):
    kind = "javascript"

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.name = sb.entry_name("javascript", self.fname, "main.js")
        _write(self.tmp, self.name, self.code)
        self.run = [sb.tool("node"), "--inspect-brk=127.0.0.1:0", self.name]
        self.url: "asyncio.Future[str]" = asyncio.get_running_loop().create_future()
        self.ws = None
        self.nid = 0
        self.pending: Dict[int, "asyncio.Future"] = {}
        self.skip = 0
        self.first = True
        self.bp_ids: List[str] = []
        self.user_scripts: set = set()          # 내 파일의 scriptId (호출 프레임에는 파일 이름이 없고 scriptId 만 와서 따로 기억한다)

    def filter(self, kind: str, text: str) -> str:
        if kind != "stderr":
            return text
        m = _NODE_URL.search(text)
        if m and not self.url.done():
            self.url.set_result(m.group(0))
        return _NODE_NOISE.sub("", text)

    async def attach(self, proc) -> None:
        self.tasks.append(asyncio.create_task(self._drive()))

    async def _send(self, method: str, params: Optional[Dict[str, Any]] = None, timeout: float = 10.0) -> Dict[str, Any]:
        self.nid += 1
        fut = asyncio.get_running_loop().create_future()
        self.pending[self.nid] = fut
        await self.ws.send(json.dumps({"id": self.nid, "method": method, "params": params or {}}))
        return await asyncio.wait_for(fut, timeout)

    async def _drive(self) -> None:
        try:
            import websockets
            url = await asyncio.wait_for(self.url, 10)
            self.ws = await websockets.connect(url, max_size=16 * 1024 * 1024, open_timeout=5)
            reader = asyncio.create_task(self._reader())
            self.tasks.append(reader)
            await self._send("Runtime.enable")
            await self._send("Debugger.enable")
            await self._send("Debugger.setPauseOnExceptions", {"state": "uncaught"})
            await self._apply_bps()
            await self._emit(ev="ready")
            await self._send("Runtime.runIfWaitingForDebugger")
            await reader
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def _apply_bps(self) -> None:
        for bid in self.bp_ids:
            try:
                await self._send("Debugger.removeBreakpoint", {"breakpointId": bid})
            except Exception:
                pass
        self.bp_ids = []
        for ln in self.bps:
            try:
                r = await self._send("Debugger.setBreakpointByUrl", {"lineNumber": int(ln) - 1, "urlRegex": ".*" + re.escape(self.name) + "$"})
                if r.get("breakpointId"):
                    self.bp_ids.append(r["breakpointId"])
            except Exception:
                pass

    async def _reader(self) -> None:
        try:
            async for raw in self.ws:
                m = json.loads(raw)
                if "id" in m:
                    fut = self.pending.pop(m["id"], None)
                    if fut and not fut.done():
                        if "error" in m:
                            fut.set_exception(RuntimeError(str(m["error"])[:200]))
                        else:
                            fut.set_result(m.get("result", {}))
                elif m.get("method") == "Debugger.scriptParsed":
                    sp = m.get("params", {})
                    u = sp.get("url") or ""
                    if u.endswith("/" + self.name) or u == self.name:
                        self.user_scripts.add(sp.get("scriptId"))
                elif m.get("method") == "Debugger.paused":
                    asyncio.create_task(self._on_paused(m.get("params", {})))
                elif m.get("method") == "Debugger.resumed":
                    self.paused = False
        except Exception:
            pass

    async def _on_paused(self, p: Dict[str, Any]) -> None:
        try:
            frames = p.get("callFrames") or []
            if not frames:
                return
            top = frames[0]
            is_user = lambda f: (f.get("location") or {}).get("scriptId") in self.user_scripts       # noqa: E731
            if not is_user(top):
                # 노드 내부 코드에서 멈췄다 (안으로 들어가기가 라이브러리 안까지 들어간 경우) → 내 코드로 돌아오거나 계속 달린다
                self.skip += 1
                await self._send("Debugger.stepOut" if self.skip < 6 else "Debugger.resume")
                return
            self.skip = 0
            line = int(top["location"]["lineNumber"]) + 1
            reason = p.get("reason") or ""
            if self.first:
                self.first = False
                if self.bps and line not in self.bps and reason != "exception":       # 중단점이 있으면 첫 줄에서 멈추지 않고 중단점까지 바로 달린다
                    await self._send("Debugger.resume")
                    return
            note = ""
            if reason in ("exception", "promiseRejection"):
                d = ((p.get("data") or {}).get("description") or "").split("\n")[0]
                note = "예외 발생: " + d[:160]
            vars_: List[Dict[str, str]] = []
            for sc in top.get("scopeChain", []):
                if sc.get("type") not in ("local", "block", "closure", "catch"):
                    continue
                oid = (sc.get("object") or {}).get("objectId")
                if not oid:
                    continue
                scope_name = "지역" if sc["type"] in ("local", "block", "catch") else "바깥"
                try:
                    res = await self._send("Runtime.getProperties", {"objectId": oid, "ownProperties": True, "generatePreview": True})
                except Exception:
                    continue
                for pr in res.get("result", []):
                    nm = pr.get("name", "")
                    if nm.startswith("__") or nm in ("exports", "require", "module", "arguments"):
                        continue
                    val = pr.get("value")
                    if not val or val.get("type") == "function":
                        continue
                    t, v = _fmt_remote(val)
                    vars_.append({"n": nm, "t": t, "v": v[:200], "s": scope_name})
                    if len(vars_) >= 60:
                        break
            stack = [{"f": (f.get("functionName") or "(익명)") if f.get("functionName") else "(모듈)", "l": int(f["location"]["lineNumber"]) + 1} for f in frames if is_user(f)][:30]
            self.paused = True; self.touch()
            await self._emit(ev="paused", line=line, func=stack[0]["f"] if stack else "", reason=reason or "step", vars=vars_, stack=stack, note=note)
        except Exception:
            pass

    async def command(self, cmd: str, msg: Dict[str, Any]) -> None:
        self.touch()
        try:
            if cmd == "breakpoints":
                self.bps = [int(x) for x in (msg.get("lines") or [])][:100]
                if self.ws is not None:
                    await self._apply_bps()
                return
            if not self.paused:
                return
            method = {"continue": "Debugger.resume", "next": "Debugger.stepOver", "step": "Debugger.stepInto", "out": "Debugger.stepOut"}.get(cmd)
            if not method:
                return
            self.paused = False
            await self._emit(ev="running")
            await self._send(method)
        except Exception:
            pass

    def close(self) -> None:
        super().close()
        ws = self.ws
        if ws is not None:
            try:
                asyncio.get_running_loop().create_task(ws.close())
            except Exception:
                pass


# ======================================================================
# 자바 (JDWP + jdb)
# ======================================================================
def java_class_by_line(code: str) -> Dict[int, str]:
    """줄 번호 → 그 줄이 들어 있는 클래스의 이름 (안쪽 클래스는 Outer$Inner). 중단점을 거는 클래스를 고르는 데 쓴다.
    문자열·주석 안의 중괄호는 무시한다. 정확한 파서는 아니지만 일반적인 학생 코드(여러 클래스, 안쪽 클래스)에서는 맞는다."""
    res: Dict[int, str] = {}
    stack: List[Tuple[str, int]] = []       # (이름, 열린 깊이)
    depth = 0
    pending: Optional[str] = None
    i, n, line = 0, len(code), 1
    in_str = in_chr = in_line = in_block = False
    first_on_line = True
    word = ""
    prev_word = ""
    def flush_word():
        nonlocal word, prev_word, pending
        if word:
            if prev_word in ("class", "interface", "enum", "record") and re.match(r"[A-Za-z_$][\w$]*$", word):
                pending = word
            prev_word = word
            word = ""
    while i < n:
        c = code[i]
        nxt = code[i + 1] if i + 1 < n else ""
        if c == "\n":
            flush_word()
            line += 1
            first_on_line = True
            in_line = False
            i += 1
            continue
        if first_on_line and not c.isspace():
            first_on_line = False
            if stack:
                res[line] = "$".join(s[0] for s in stack)
        if in_line:
            i += 1; continue
        if in_block:
            if c == "*" and nxt == "/":
                in_block = False; i += 2; continue
            i += 1; continue
        if in_str:
            if c == "\\":
                i += 2; continue
            if c == '"':
                in_str = False
            i += 1; continue
        if in_chr:
            if c == "\\":
                i += 2; continue
            if c == "'":
                in_chr = False
            i += 1; continue
        if c == "/" and nxt == "/":
            in_line = True; i += 2; continue
        if c == "/" and nxt == "*":
            in_block = True; i += 2; continue
        if c == '"':
            flush_word(); in_str = True; i += 1; continue
        if c == "'":
            flush_word(); in_chr = True; i += 1; continue
        if c.isalnum() or c in "_$":
            word += c; i += 1; continue
        flush_word()
        if c == "{":
            depth += 1
            if pending:
                stack.append((pending, depth)); pending = None
        elif c == "}":
            if stack and stack[-1][1] == depth:
                stack.pop()
            depth = max(0, depth - 1)
        elif c == ";":
            pending = None
        i += 1
    return res


def _java_kind(val: str) -> str:
    """jdb 의 locals 는 기본형(int 등)의 자료형을 알려 주지 않아서, 값 모양으로 짐작해서 보여 준다."""
    if val.startswith('"'):
        return "String"
    if val == "null":
        return "null"
    if val.startswith("instance of"):
        return "object"
    if val in ("true", "false"):
        return "boolean"
    if re.match(r"^-?\d[\d,]*$", val):
        return "int"
    if re.match(r"^-?[\d,]*\.\d+(?:[eE][-+]?\d+)?$|^-?\d+(?:[eE][-+]?\d+)$|^(?:NaN|-?Infinity)$", val):
        return "double"
    if re.match(r"^'.*'$", val):
        return "char"
    return "값"


class JavaSession(Session):
    kind = "java"

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        file_name, full = sb.java_layout(self.code)
        stem = (self.fname or "").replace("\\", "/").split("/")[-1]
        if stem.lower().endswith(".java") and re.match(r"^[A-Za-z_$][\w$]*$", stem[:-5]):
            file_name = stem
        _write(self.tmp, file_name, self.code)
        self.main_class = full
        self.by_line = java_class_by_line(self.code)
        self.port = _free_port()
        self.listening: "asyncio.Future[bool]" = asyncio.get_running_loop().create_future()
        javac = sb.tool("javac")
        self.comp = [javac, "-g", "-encoding", "UTF-8", "-d", ".", file_name]
        self.run = [sb.tool("java"), "-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8",
                    "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:%d" % self.port, "-cp", ".", full]
        self.jdb: Optional[asyncio.subprocess.Process] = None
        self.buf = ""
        self.user_classes = (set(self.by_line.values()) | {full}) - {""}
        jexe = sb.tool("java") or ""
        cand = os.path.join(os.path.dirname(jexe), "jdb") if jexe else ""
        self.jdb_path = cand if (cand and os.path.exists(cand)) else (shutil.which("jdb") or "jdb")

    def filter(self, kind: str, text: str) -> str:
        if "Listening for transport dt_socket" in text:
            if not self.listening.done():
                self.listening.set_result(True)
            text = re.sub(r"^Listening for transport dt_socket at address: \d+\r?\n", "", text, flags=re.M)
        return text

    async def attach(self, proc) -> None:
        self.tasks.append(asyncio.create_task(self._drive(proc)))

    # jdb 입출력 -----------------------------------------------------------
    _PROMPT = re.compile(r"(?:^|\n)(?:>|[\w\-.]+\[\d+\]) $")
    _THREAD_PROMPT = re.compile(r"(?:^|\n)[\w\-.]+\[\d+\] $")

    async def _read_until(self, thread_prompt: bool, timeout: float) -> Optional[str]:
        """jdb 출력을 읽어서 프롬프트가 나오면 그때까지의 글을 돌려준다 (프로그램이 끝나서 jdb 가 닫히면 None)."""
        pat = self._THREAD_PROMPT if thread_prompt else self._PROMPT
        end = time.monotonic() + timeout
        while True:
            m = pat.search(self.buf)
            if m:
                out = self.buf[:m.start()]
                self.buf = ""
                return out
            if "The application exited" in self.buf or "The application has been disconnected" in self.buf:
                self.buf = ""
                return None
            left = end - time.monotonic()
            if left <= 0:
                out, self.buf = self.buf, ""
                return out
            try:
                chunk = await asyncio.wait_for(self.jdb.stdout.read(4096), min(left, 1.0))
            except asyncio.TimeoutError:
                continue
            if not chunk:
                return None
            self.buf += chunk.decode("utf-8", "replace").replace("\r", "")

    async def _jdb(self, command: str, thread_prompt: bool = True, timeout: float = 8.0) -> Optional[str]:
        try:
            self.jdb.stdin.write((command + "\n").encode("utf-8"))
            await self.jdb.stdin.drain()
        except Exception:
            return None
        return await self._read_until(thread_prompt, timeout)

    # 세션 -----------------------------------------------------------------
    async def _drive(self, proc) -> None:
        try:
            await asyncio.wait_for(self.listening, 8)
            self.jdb = await asyncio.create_subprocess_exec(
                self.jdb_path,
                "-J-Xmx48m", "-J-XX:+UseSerialGC", "-J-Xss512k", "-sourcepath", self.tmp, "-attach", "127.0.0.1:%d" % self.port,
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, cwd=self.tmp, env=sb._clean_env(self.tmp))
            first = await self._read_until(True, 10)
            if first is None:
                await self._emit(ev="notice", text="디버거를 연결하지 못했어요. 다시 시도해 주세요.")
                return
            bad: List[int] = []
            for ln in self.bps:
                cls = self.by_line.get(ln) or self.main_class
                cls = cls or self.main_class
                out = await self._jdb("stop at %s:%d" % (cls, ln))
                if out is not None and ("Unable" in out or "Invalid" in out or "not found" in out.lower()):
                    bad.append(ln)
            if not self.bps:
                await self._jdb("stop in %s.main" % self.main_class)
            if bad:
                await self._emit(ev="notice", text="%s번째 줄에는 중단점을 걸 수 없어요 (실행되는 코드가 없는 줄이에요)." % ", ".join(map(str, bad)))
            await self._emit(ev="ready")
            await self._resume_and_wait("resume")
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def _resume_and_wait(self, command: str) -> None:
        """프로그램을 움직이는 명령을 보내고, 다음에 멈출 때까지 기다린다 (멈추면 화면에 알린다)."""
        self.paused = False
        out = await self._jdb(command, thread_prompt=True, timeout=WALL_SECONDS)
        if out is None or self.closed:
            return
        for mm in re.finditer(r"Unable to set deferred breakpoint [\w$.]+:(\d+)", out):
            await self._emit(ev="notice", text="%s번째 줄에는 중단점을 걸 수 없어요 (실행되는 코드가 없는 줄이에요)." % mm.group(1))
        loc = self._parse_location(out)
        if loc is None:
            return
        cls, func, line, reason, note = loc
        top_cls = cls.split("$")[0] if cls else ""
        if cls and not (cls in self.user_classes or top_cls in self.user_classes):
            # 자바 내부 코드(Thread.exit 등)로 들어갔다 → 내 코드가 아니니 계속 달린다
            await self._resume_and_wait("cont")
            return
        vars_ = await self._read_vars()
        stack = await self._read_stack()
        self.paused = True; self.touch()
        await self._emit(ev="paused", line=line, func=func, reason=reason, vars=vars_, stack=stack, note=note)

    _LOC = re.compile(r'(?P<kind>Breakpoint hit|Step completed|Exception occurred)[^"\n]*"thread=[^"]*", (?P<cls>[\w$.]+)\.(?P<fn>[\w$<>]+)\(\), line=(?P<line>[\d,]+)')

    def _parse_location(self, text: str):
        m = self._LOC.search(text)
        if not m:
            return None
        kind = m.group("kind")
        line = int(m.group("line").replace(",", ""))
        note = ""
        reason = "breakpoint" if kind == "Breakpoint hit" else ("exception" if kind == "Exception occurred" else "step")
        if reason == "exception":
            mm = re.search(r"Exception occurred: ([\w$.]+)", text)
            note = "예외 발생: " + (mm.group(1).split(".")[-1] if mm else "")
        return m.group("cls"), m.group("fn"), line, reason, note

    async def _read_vars(self) -> List[Dict[str, str]]:
        out = await self._jdb("locals", timeout=4)
        vars_: List[Dict[str, str]] = []
        if not out:
            return vars_
        dumped = 0
        for ln in out.split("\n"):
            m = re.match(r"^([A-Za-z_$][\w$]*) = (.*)$", ln.strip())
            if not m:
                continue
            name, val = m.group(1), m.group(2).strip()
            t = _java_kind(val)
            if val.startswith("instance of") and dumped < 6:
                d = await self._jdb("dump " + name, timeout=2)
                dumped += 1
                if d:
                    one = " ".join(x.strip() for x in d.strip().split("\n"))
                    one = re.sub(r"^%s = " % re.escape(name), "", one)
                    if one and "Name unknown" not in one:
                        val = one
                        mt = re.match(r"^instance of ([\w$.\[\]]+)", m.group(2).strip())
                        t = mt.group(1).split(".")[-1] if mt else t
            vars_.append({"n": name, "t": t, "v": val[:200], "s": "지역"})
        this = await self._jdb("dump this", timeout=2)
        if this and "Exception" not in this and "Name unknown" not in this and "null" not in this[:20]:
            one = " ".join(x.strip() for x in this.strip().split("\n"))
            one = re.sub(r"^this = ", "", one)
            if one:
                vars_.append({"n": "this", "t": "객체", "v": one[:200], "s": "지역"})
        return vars_[:60]

    async def _read_stack(self) -> List[Dict[str, Any]]:
        out = await self._jdb("where", timeout=3)
        res: List[Dict[str, Any]] = []
        for ln in (out or "").split("\n"):
            m = re.match(r"^\s*\[\d+\] ([\w$.<>]+) \(([^:]+):(\d+)\)", ln)
            if m:
                cls = m.group(1).rsplit(".", 1)[0]
                if cls in self.user_classes or cls.split("$")[0] in self.user_classes:
                    res.append({"f": m.group(1).split(".")[-1], "l": int(m.group(3))})
        return res[:30]

    async def command(self, cmd: str, msg: Dict[str, Any]) -> None:
        self.touch()
        if self.jdb is None:
            return
        try:
            if cmd == "breakpoints":
                return                              # 자바는 실행 중에 바꾼 중단점을 다음 디버그부터 쓴다
            jc = {"continue": "cont", "next": "next", "step": "step", "out": "step up"}.get(cmd)
            if not jc or not self.paused:
                return
            self.paused = False
            await self._emit(ev="running")
            self.tasks.append(asyncio.create_task(self._resume_and_wait(jc)))
        except Exception:
            pass

    def close(self) -> None:
        super().close()
        jp = self.jdb
        if jp is not None and jp.returncode is None:
            try:
                jp.kill()
            except Exception:
                pass


def create(lang: str, tmp: str, fname: Optional[str], code: str, bps: List[int], emit: Callable[[Dict[str, Any]], Any]) -> Optional[Session]:
    bps = [b for b in dict.fromkeys(int(x) for x in bps if str(x).lstrip("-").isdigit() and int(x) > 0)][:100]
    if lang == "python":
        return PySession(tmp, fname, code, bps, emit)
    if lang == "javascript":
        return NodeSession(tmp, fname, code, bps, emit)
    if lang == "java":
        return JavaSession(tmp, fname, code, bps, emit)
    return None
