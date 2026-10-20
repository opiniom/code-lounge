#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DureSync 러너 — 내 컴퓨터에 설치한 언어로 워크스페이스 코드를 실행해 주는 작은 프로그램.

이 프로그램은 내 컴퓨터에서만 열려 있고(127.0.0.1), DureSync 웹사이트가 코드를 보내면
내 컴퓨터에 설치된 언어(Python · Node · Java · C · C++ · C# · Go · Rust · Ruby · PHP · Perl · Bash)로 실행해서 결과를 돌려줍니다.
설치할 것은 없고 Python 3.7 이상만 있으면 됩니다.   실행:  python3 duresync_runner.py      (윈도우: py duresync_runner.py)

안전장치
  · 127.0.0.1 로만 열려서 같은 와이파이의 다른 컴퓨터는 접속할 수 없어요.
  · 허락한 웹사이트(아래 ALLOWED_ORIGINS)에서 온 요청만 받아요. 다른 웹사이트가 내 컴퓨터에서 코드를 실행할 수 없어요.
  · 처음 한 번 웹사이트에 '연결 코드'를 입력해야 해요. 코드는 내 컴퓨터에만 저장돼요(~/.duresync-runner/token).
  · 실행한 코드는 '내 컴퓨터에서, 내 권한으로' 돌아가요 (서버처럼 격리되지 않아요). 믿을 수 있는 코드만 실행하세요.
  · 한 번에 실행하는 시간·출력 크기를 제한해요.
옵션:  --port 47321  --allow-origin https://내사이트  --max-seconds 300  --show-token  --reset-token
자동 시작:  python3 duresync_runner.py --install-autostart     컴퓨터를 켤 때마다 알아서 켜져요 (끄기: --uninstall-autostart)
언어 자동 인식:  언어를 새로 설치하면 ▶ 실행할 때 러너가 알아서 다시 찾아요 (다시 켜거나 '다시 검색'을 누를 필요 없어요)
"""
import argparse
import asyncio
import base64
import glob
import hashlib
import json
import os
import platform
import re
import secrets
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time

RUNNER_VERSION = "1.1.0"
DEFAULT_PORT = 47321
# 서버가 이 파일을 내려줄 때 이 줄을 자기 주소로 바꿔 준다 (그래서 다운로드한 러너는 그 사이트만 믿는다)
ALLOWED_ORIGINS = ["__DURESYNC_ORIGIN__"]
IS_WINDOWS = os.name == "nt"
OUT_CAP = 2 * 1024 * 1024
MAX_CODE = 500_000
LABELS = {"python": "Python", "javascript": "JavaScript", "typescript": "TypeScript", "java": "Java", "c": "C", "cpp": "C++", "csharp": "C#",
          "ruby": "Ruby", "php": "PHP", "perl": "Perl", "bash": "Bash", "go": "Go", "rust": "Rust"}


# ============================================================ 설치된 언어 찾기
def _home(*p):
    return os.path.join(os.path.expanduser("~"), *p)


def _path_dirs():
    return [d for d in os.environ.get("PATH", "").split(os.pathsep) if d]


def _which_all(names):
    """PATH 에서 이름이 같거나 비슷한 실행 파일을 모두 (python3, python3.11 …)"""
    found = []
    exts = [""] + (os.environ.get("PATHEXT", ".EXE;.BAT;.CMD").lower().split(";") if IS_WINDOWS else [])
    for d in _path_dirs():
        for n in names:
            for pat in ([n] if "*" not in n else []):
                for e in exts:
                    p = os.path.join(d, pat + e)
                    if os.path.isfile(p) and os.access(p, os.X_OK):
                        found.append(p)
            if "*" in n:
                for p in glob.glob(os.path.join(d, n)):
                    if os.path.isfile(p) and os.access(p, os.X_OK) and not p.endswith((".config", "-config", ".py", ".pyc")):
                        found.append(p)
    return found


def _version_of(argv, timeout=8):
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, env=dict(os.environ, DOTNET_NOLOGO="1", DOTNET_CLI_TELEMETRY_OPTOUT="1"))
        line = ((r.stdout or r.stderr or "").strip().splitlines() or [""])[0]
    except Exception:
        return ""
    m = re.search(r"(\d+(?:\.\d+){1,3})", line)
    return m.group(1) if m else ""


def _uniq(paths):
    seen, out = set(), []
    for p in paths:
        try:
            rp = os.path.realpath(p)
        except OSError:
            continue
        if rp not in seen:
            seen.add(rp)
            out.append(p)
    return out


def scan_tools():
    """{언어: [{id, label, tools:{...}}]} — 이 컴퓨터에 설치된 언어와 버전들. id 는 버전 문자열(같은 버전이 둘이면 뒤에 -2 …)"""
    inv = {}

    def add(lang, tools, ver, extra=""):
        items = inv.setdefault(lang, [])
        lbl = (ver or "?") + (f" ({extra})" if extra else "")
        if any(i["label"] == lbl for i in items):          # 같은 버전이 다른 경로에 또 있으면 하나만 보여 준다 (심볼릭 링크·중복 설치)
            return
        vid = ver or "?"
        base, n = vid, 2
        while any(i["id"] == vid for i in items):
            vid = f"{base}-{n}"; n += 1
        items.append({"id": vid, "version": ver, "label": (ver or "?") + (f" ({extra})" if extra else ""), "tools": tools})

    # Python
    cands = _which_all(["python3", "python", "python3.*"]) + glob.glob(_home(".pyenv", "versions", "*", "bin", "python")) + glob.glob("/opt/homebrew/bin/python3*") + glob.glob("/usr/local/bin/python3*")
    if IS_WINDOWS:
        cands += glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Python", "Python*", "python.exe"))
    for p in _uniq([c for c in cands if not re.search(r"-config$", c)]):
        v = _version_of([p, "--version"])
        if v and not v.startswith("2.") and ("WindowsApps" not in p):
            add("python", {"py": p}, v)
    # Node (JavaScript · TypeScript)
    cands = _which_all(["node"]) + glob.glob(_home(".nvm", "versions", "node", "*", "bin", "node")) + glob.glob(_home(".volta", "tools", "image", "node", "*", "bin", "node")) + glob.glob(_home(".fnm", "node-versions", "*", "installation", "bin", "node"))
    for p in _uniq(cands):
        v = _version_of([p, "--version"])
        if v:
            add("javascript", {"node": p}, v)
            nums = [int(x) for x in v.split(".")[:2]]
            if nums[0] > 23 or (nums[0] == 23 and nums[1] >= 6) or (nums[0] == 22 and nums[1] >= 18):
                add("typescript", {"node": p, "ts": []}, v)
            elif nums[0] == 22 and nums[1] >= 6:
                add("typescript", {"node": p, "ts": ["--experimental-strip-types"]}, v)
    # Java (javac + java 가 같이 있는 JDK 만)
    homes = []
    if os.environ.get("JAVA_HOME"):
        homes.append(os.environ["JAVA_HOME"])
    for g in ("/Library/Java/JavaVirtualMachines/*/Contents/Home", "/usr/lib/jvm/*", _home(".sdkman", "candidates", "java", "*"), "/opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home",
              "/opt/homebrew/opt/openjdk*", r"C:\Program Files\Java\*", r"C:\Program Files\Eclipse Adoptium\*", r"C:\Program Files\Microsoft\jdk-*"):
        homes += glob.glob(g)
    javac_list = [os.path.join(h, "bin", "javac" + (".exe" if IS_WINDOWS else "")) for h in homes] + _which_all(["javac"])
    for jc in _uniq([p for p in javac_list if os.path.isfile(p)]):
        jv = os.path.join(os.path.dirname(jc), "java" + (".exe" if IS_WINDOWS else ""))
        v = _version_of([jc, "--version"])
        if v and os.path.isfile(jv):
            add("java", {"javac": jc, "java": jv}, v)
    # C / C++
    for lang, names in (("c", ["gcc", "cc", "clang"]), ("cpp", ["g++", "c++", "clang++"])):
        for p in _uniq(_which_all(names)):
            v = _version_of([p, "--version"])
            if v:
                kind = "clang" if "clang" in os.path.basename(os.path.realpath(p)) or "Apple" in (subprocess.run([p, "--version"], capture_output=True, text=True).stdout or "") else os.path.basename(p)
                add(lang, {"cc": p}, v, kind)
    # C# (.NET SDK 의 csc.dll → 없으면 Mono)
    dn_c = _which_all(["dotnet"]) + glob.glob(_home(".dotnet", "dotnet")) + ["/usr/local/share/dotnet/dotnet", "/usr/share/dotnet/dotnet", r"C:\Program Files\dotnet\dotnet.exe"]
    for p in _uniq([c for c in dn_c if os.path.isfile(c)]):
        info = _dotnet_info(p)
        if info:
            add("csharp", {"dotnet": p, "info": info}, _version_of([p, "--version"]), ".NET")
    for p in _uniq(_which_all(["mcs"])):
        mono = shutil.which("mono")
        if mono:
            add("csharp", {"mcs": p, "mono": mono}, _version_of([p, "--version"]), "Mono")
    # Go · Rust · Ruby · PHP · Perl · Bash
    for lang, names, key, args in (("go", ["go"], "go", ["version"]), ("rust", ["rustc"], "rustc", ["--version"]), ("ruby", ["ruby"], "ruby", ["--version"]),
                                   ("php", ["php"], "php", ["--version"]), ("perl", ["perl"], "perl", ["--version"]), ("bash", ["bash"], "bash", ["--version"])):
        extra = _which_all(names)
        if lang == "go":
            extra += glob.glob(_home("sdk", "go*", "bin", "go")) + glob.glob("/usr/local/go/bin/go")
        if lang == "rust":
            extra += glob.glob(_home(".cargo", "bin", "rustc"))
        for p in _uniq(extra):
            if lang == "bash" and IS_WINDOWS:
                continue
            v = _version_of([p] + args)
            if v:
                add(lang, {key: p}, v)
    for lang in inv:                                  # 높은 버전이 앞
        inv[lang].sort(key=lambda i: [int(x) for x in re.findall(r"\d+", i["version"])[:3]] or [0], reverse=True)
    return inv


def _dotnet_info(dotnet_exe):
    root = os.path.dirname(os.path.realpath(dotnet_exe))
    try:
        csc = sorted(glob.glob(os.path.join(root, "sdk", "*", "Roslyn", "bincore", "csc.dll")))[-1]
        refdir = sorted(d for d in glob.glob(os.path.join(root, "packs", "Microsoft.NETCore.App.Ref", "*", "ref", "net*")) if os.path.isdir(d))[-1]
        rt = os.path.basename(sorted(glob.glob(os.path.join(root, "shared", "Microsoft.NETCore.App", "*")))[-1])
    except IndexError:
        return None
    return {"root": root, "csc": csc, "refdir": refdir, "runtime": rt, "tfm": "net" + ".".join(rt.split(".")[:2])}


# ============================================================ 실행 명령 만들기
def _java_names(code):
    nc = re.sub(r"//.*|/\*.*?\*/", "", code, flags=re.S)
    pkg = re.search(r"^\s*package\s+([\w.]+)\s*;", nc, re.M)
    pub = re.search(r"\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+(\w+)", nc)
    main_at = re.search(r"\bstatic\s+void\s+main\s*\(", nc)
    main_cls = None
    if main_at:
        before = list(re.finditer(r"\b(?:class|enum|record)\s+(\w+)", nc[: main_at.start()]))
        main_cls = before[-1].group(1) if before else None
    return (main_cls or (pub.group(1) if pub else None) or "Main"), (pkg.group(1) if pkg else None), (pub.group(1) if pub else None)


_ENTRY_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}$")
_EXT = {"python": (".py",), "javascript": (".js", ".mjs", ".cjs"), "typescript": (".ts",), "ruby": (".rb",), "php": (".php",), "perl": (".pl",), "bash": (".sh", ".bash"),
        "c": (".c",), "cpp": (".cpp", ".cc", ".cxx"), "csharp": (".cs",), "go": (".go",), "rust": (".rs",)}


def _entry(lang, requested, default):
    """사용자가 연 파일의 이름을 실행 파일 이름으로 쓴다(오류 메시지에 내 파일 이름이 나오게). 이상한 이름은 기본 이름"""
    name = (requested or "").replace("\\", "/").split("/")[-1].strip()
    if not name or not _ENTRY_RE.match(name) or ".." in name or not name.lower().endswith(_EXT.get(lang, ())):
        return default
    stem = name.rsplit(".", 1)[0]
    if lang == "python" and stem in set(getattr(sys, "stdlib_module_names", ())) | {"random", "math", "json", "os", "sys", "re", "time", "string", "typing", "collections"}:
        return default
    if lang == "go" and (name.endswith("_test.go") or stem.startswith("_")):
        return default
    return name


class RunError(Exception):
    pass


def build(lang, tools, tmp, code, fname):
    """(컴파일 명령 또는 None, 실행 명령, 안내 이름)"""
    def w(name, text):
        with open(os.path.join(tmp, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        return name
    exe = os.path.join(tmp, "prog.exe" if IS_WINDOWS else "prog")
    if lang == "python":
        return None, [tools["py"], "-u", "-B", w(_entry(lang, fname, "main.py"), code)], "Python"
    if lang == "javascript":
        return None, [tools["node"], w(_entry(lang, fname, "main.js"), code)], "JavaScript"
    if lang == "typescript":
        return None, [tools["node"]] + tools.get("ts", []) + [w(_entry(lang, fname, "main.ts"), code)], "TypeScript"
    if lang == "ruby":
        n = w(_entry(lang, fname, "main.rb"), code)
        return None, [tools["ruby"], "-e", "$stdout.sync=true; $stderr.sync=true; load './%s'" % n], "Ruby"
    if lang == "php":
        return None, [tools["php"], "-d", "output_buffering=0", "-d", "implicit_flush=1", w(_entry(lang, fname, "main.php"), code)], "PHP"
    if lang == "perl":
        n = w(_entry(lang, fname, "main.pl"), code)
        return None, [tools["perl"], "-e", "$|=1; do './%s'; die $@ if $@" % n], "Perl"
    if lang == "bash":
        return None, [tools["bash"], w(_entry(lang, fname, "main.sh"), code)], "Bash"
    if lang in ("c", "cpp"):
        src = w(_entry(lang, fname, "main.c" if lang == "c" else "main.cpp"), code)
        cc = tools["cc"]
        comp = [cc, "-O2", "-o", exe, src] + (["-lm"] if lang == "c" else [])
        if lang == "cpp":
            comp = [cc, "-O2", "-std=c++17", "-o", exe, src]
        return comp, [exe], "C" if lang == "c" else "C++"
    if lang == "java":
        main_cls, pkg, pub = _java_names(code)
        stem = (fname or "").replace("\\", "/").split("/")[-1]
        stem = stem[:-5] if stem.lower().endswith(".java") else None
        if stem and pub and pub != stem:
            raise RunError("%s.java: error: class %s is public, should be declared in a file named %s.java\n→ 파일 이름(%s.java)과 public 클래스 이름(%s)이 달라요. 둘 중 하나를 같게 맞춰 주세요." % (stem, pub, pub, stem, pub))
        fn = (pub or stem or main_cls) + ".java"
        if stem and not pub and re.match(r"^[A-Za-z_$][\w$]*$", stem):
            fn = stem + ".java"
        w(fn, code)
        return ([tools["javac"], "-encoding", "UTF-8", "-d", ".", fn],
                [tools["java"], "-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8", "-cp", ".", (pkg + "." + main_cls) if pkg else main_cls], "Java")
    if lang == "csharp":
        cs = w(_entry(lang, fname, "Program.cs"), code)
        if tools.get("info"):
            d = tools["info"]
            refs = sorted(glob.glob(os.path.join(d["refdir"], "*.dll")))
            w("refs.rsp", "\n".join("-r:" + r for r in refs) + "\n")
            w("Program.runtimeconfig.json", '{"runtimeOptions":{"tfm":"%s","framework":{"name":"Microsoft.NETCore.App","version":"%s"}}}' % (d["tfm"], d["runtime"]))
            return [tools["dotnet"], d["csc"], "-nologo", "-target:exe", "-out:Program.dll", "@refs.rsp", cs], [tools["dotnet"], "Program.dll"], "C#"
        return [tools["mcs"], "-out:Program.exe", cs], [tools["mono"], "Program.exe"], "C#"
    if lang == "go":
        g = w(_entry(lang, fname, "main.go"), code)
        return [tools["go"], "build", "-o", exe, g], [exe], "Go"
    if lang == "rust":
        r = w(_entry(lang, fname, "main.rs"), code)
        return [tools["rustc"], "-O", "-o", exe, r], [exe], "Rust"
    raise RunError("지원하지 않는 언어예요: %s" % lang)


def _env(tmp, tools):
    env = dict(os.environ)
    env.update({"PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1"})
    if tools.get("info"):
        env.update({"DOTNET_ROOT": tools["info"]["root"], "DOTNET_NOLOGO": "1", "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_SYSTEM_GLOBALIZATION_INVARIANT": "1"})
    if tools.get("go"):
        env.update({"GOFLAGS": "-mod=mod", "GO111MODULE": "auto"})
    return env


def kill_tree(proc):
    try:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


# ============================================================ 웹소켓 (표준 라이브러리만으로)
class Closed(Exception):
    pass


class WS:
    def __init__(self, reader, writer):
        self.r, self.w = reader, writer
        self.lock = asyncio.Lock()

    async def recv(self, limit=2_000_000):
        """텍스트 메시지 하나 (조각난 메시지는 합쳐서). 닫히면 Closed"""
        buf, op0 = b"", None
        while True:
            try:
                h = await self.r.readexactly(2)
            except (asyncio.IncompleteReadError, ConnectionError):
                raise Closed()
            fin, opcode, masked, ln = h[0] & 0x80, h[0] & 0x0F, h[1] & 0x80, h[1] & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", await self.r.readexactly(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", await self.r.readexactly(8))[0]
            if ln > limit or not masked:                      # 브라우저는 항상 마스킹한다 → 아니면 이상한 클라이언트
                raise Closed()
            mask = await self.r.readexactly(4)
            data = bytearray(await self.r.readexactly(ln))
            for i in range(len(data)):
                data[i] ^= mask[i % 4]
            if opcode == 0x8:
                raise Closed()
            if opcode == 0x9:
                await self._frame(0xA, bytes(data)); continue
            if opcode == 0xA:
                continue
            if opcode in (0x1, 0x2):
                op0, buf = opcode, bytes(data)
            elif opcode == 0x0:
                buf += bytes(data)
            if len(buf) > limit:
                raise Closed()
            if fin:
                return buf.decode("utf-8", "replace")

    async def _frame(self, opcode, payload):
        n = len(payload)
        head = bytes([0x80 | opcode]) + (bytes([n]) if n < 126 else (b"\x7e" + struct.pack(">H", n) if n < 65536 else b"\x7f" + struct.pack(">Q", n)))
        async with self.lock:
            self.w.write(head + payload)
            await self.w.drain()

    async def send(self, obj):
        try:
            await self._frame(0x1, json.dumps(obj, ensure_ascii=False).encode("utf-8"))
        except Exception:
            raise Closed()

    async def close(self, code=1000):
        try:
            await self._frame(0x8, struct.pack(">H", code))
            self.w.close()
        except Exception:
            pass


async def handshake(reader, writer, port, origins, allow_no_origin):
    """HTTP 요청을 읽어 웹소켓으로 올린다. 허락되지 않은 요청이면 거절 (DNS rebinding · 다른 웹사이트 차단)"""
    try:
        raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
    except Exception:
        return None
    lines = raw.decode("latin-1").split("\r\n")
    h = {}
    for ln in lines[1:]:
        if ":" in ln:
            k, v = ln.split(":", 1)
            h[k.strip().lower()] = v.strip()

    def reply(status, body, ctype="text/plain; charset=utf-8"):
        b = body.encode("utf-8")
        writer.write(("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n" % (status, ctype, len(b))).encode() + b)
    host = h.get("host", "")
    if host not in ("127.0.0.1:%d" % port, "localhost:%d" % port, "[::1]:%d" % port):
        reply("403 Forbidden", "host not allowed"); return None
    if h.get("upgrade", "").lower() != "websocket":
        reply("200 OK", json.dumps({"name": "DureSync Runner", "version": RUNNER_VERSION}), "application/json"); return None
    origin = h.get("origin", "")
    if origin not in origins and not (not origin and allow_no_origin):
        reply("403 Forbidden", "origin not allowed"); return None
    key = h.get("sec-websocket-key")
    if not key:
        reply("400 Bad Request", "bad request"); return None
    acc = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
    writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n" % acc).encode())
    await writer.drain()
    return WS(reader, writer)


# ============================================================ 서버 본체
class Runner:
    def __init__(self, port, origins, token, max_seconds, allow_no_origin):
        self.port, self.origins, self.token, self.max_seconds, self.allow_no_origin = port, set(origins), token, max_seconds, allow_no_origin
        self.inv = {}
        self.running = 0
        self.scanned_at = 0.0
        self._scanning = None

    def public_inv(self):
        return {lang: [{"id": i["id"], "version": i["version"], "label": i["label"]} for i in items] for lang, items in self.inv.items()}

    async def rescan(self):
        """내 컴퓨터의 언어를 다시 찾는다 (동시에 여러 번 부르면 한 번만 찾고 같이 기다린다)"""
        if self._scanning is None:
            async def go():
                try:
                    self.inv = await asyncio.get_event_loop().run_in_executor(None, scan_tools)
                    self.scanned_at = time.time()
                finally:
                    self._scanning = None
            self._scanning = asyncio.ensure_future(go())
        await asyncio.shield(self._scanning)

    def has(self, lang, ver=None):
        items = self.inv.get(lang) or []
        return bool(items) and (not ver or any(i["id"] == ver for i in items))

    async def handle(self, reader, writer):
        ws = await handshake(reader, writer, self.port, self.origins, self.allow_no_origin)
        if not ws:
            try:
                writer.close()
            except Exception:
                pass
            return
        proc, tmp, tasks = None, None, []
        try:
            try:                                                           # 1) 연결 코드 확인 (5초 안에)
                first = json.loads(await asyncio.wait_for(ws.recv(), 5))
            except Exception:
                await ws.close(4400); return
            if first.get("action") != "hello" or not secrets.compare_digest(str(first.get("token", "")), self.token):
                await ws.send({"type": "hello", "ok": False, "why": "token"}); await ws.close(4401); return
            await ws.send({"type": "hello", "ok": True, "version": RUNNER_VERSION, "os": platform.system(), "runtimes": self.public_inv(), "max_seconds": self.max_seconds})
            if time.time() - self.scanned_at > 20:                         # 설치한 언어가 늘었을 수 있으니 뒤에서 조용히 다시 찾아 둔다
                asyncio.ensure_future(self.rescan())
            while True:
                msg = json.loads(await ws.recv())
                act = msg.get("action")
                if act == "inventory":
                    await self.rescan(); await ws.send({"type": "inventory", "runtimes": self.public_inv()})
                elif act == "start" and proc is None:
                    proc, tmp, tasks = await self.start(ws, msg)
                elif act == "input" and proc is not None and proc.returncode is None and proc.stdin:
                    try:
                        proc.stdin.write(str(msg.get("data", ""))[:4096].encode("utf-8")); await proc.stdin.drain()
                    except Exception:
                        pass
                elif act == "stop" and proc is not None:
                    proc.stopped = True                                     # 중지 안내는 여기서 한 번만 (watch 가 또 보내지 않게)
                    kill_tree(proc)
                    await ws.send({"type": "exit", "data": "\n\x1b[33m[사용자에 의해 강제 중단됨]\x1b[0m\n", "code": -1})
                    proc = None
                elif act == "start" and proc is not None and proc.returncode is not None:
                    proc, tmp, tasks = await self.start(ws, msg)
        except Closed:
            pass
        except Exception:
            pass
        finally:
            if proc is not None and proc.returncode is None:
                kill_tree(proc)
            for t in tasks:
                t.cancel()
            if tmp:
                shutil.rmtree(tmp, ignore_errors=True)
            try:
                writer.close()
            except Exception:
                pass

    async def start(self, ws, msg):
        lang = str(msg.get("language", "")).lower()
        code = msg.get("source_code") or ""
        ver = msg.get("runtime_version") or None
        if not self.has(lang, ver) and time.time() - self.scanned_at > 2:    # 방금 설치했을 수 있다: 없다고 하기 전에 한 번 더 찾아 본다
            try:
                await self.rescan()
            except Exception:
                pass
        if lang not in self.inv:
            await ws.send({"type": "stderr", "data": "이 컴퓨터에서 %s 를 찾지 못했어요. 설치한 뒤 러너를 다시 시작하거나 '다시 검색'을 눌러 주세요.\n" % LABELS.get(lang, lang)})
            await ws.send({"type": "exit", "data": "", "code": 1}); return None, None, []
        if len(code) > MAX_CODE:
            await ws.send({"type": "stderr", "data": "코드가 너무 길어요.\n"}); await ws.send({"type": "exit", "data": "", "code": 1}); return None, None, []
        if self.running >= 3:
            await ws.send({"type": "stderr", "data": "동시에 너무 많이 실행 중이에요.\n"}); await ws.send({"type": "exit", "data": "", "code": 1}); return None, None, []
        want = str(msg.get("runtime_version") or "")
        if want and not self.has(lang, want):                              # 고른 버전이 지워졌다면 몰래 다른 버전으로 돌리지 않는다
            await ws.send({"type": "stderr", "data": "이 컴퓨터에서 %s %s 를 찾지 못했어요 (지웠나요?). ▶ 옆 선택 박스에서 다른 버전을 골라 주세요.\n" % (LABELS.get(lang, lang), want)})
            await ws.send({"type": "exit", "data": "", "code": 1}); return None, None, []
        item = next((i for i in self.inv[lang] if i["id"] == want), self.inv[lang][0])
        tmp = tempfile.mkdtemp(prefix="duresync_run_")
        try:
            comp, run, label = build(lang, item["tools"], tmp, code, str(msg.get("file_name") or ""))
        except RunError as e:
            await ws.send({"type": "stderr", "data": "\x1b[31m[컴파일 에러]\n%s\x1b[0m\n" % e}); await ws.send({"type": "exit", "data": "", "code": 1})
            shutil.rmtree(tmp, ignore_errors=True); return None, None, []
        env = _env(tmp, item["tools"])
        kw = {"creationflags": 0x00000200} if IS_WINDOWS else {"start_new_session": True}
        if comp:
            await ws.send({"type": "stdout", "data": "\x1b[36m[%s 컴파일 중...]\x1b[0m\n" % label})
            try:
                cp = await asyncio.create_subprocess_exec(*comp, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=tmp, env=env, **kw)
                out, err = await asyncio.wait_for(cp.communicate(), 60)
            except asyncio.TimeoutError:
                kill_tree(cp); await ws.send({"type": "stderr", "data": "\x1b[31m[컴파일 시간이 너무 오래 걸려서 중단했어요]\x1b[0m\n"}); await ws.send({"type": "exit", "data": "", "code": 1})
                shutil.rmtree(tmp, ignore_errors=True); return None, None, []
            except Exception as e:
                await ws.send({"type": "stderr", "data": "\x1b[31m실행 도구를 시작하지 못했어요: %s\x1b[0m\n" % e}); await ws.send({"type": "exit", "data": "", "code": 1})
                shutil.rmtree(tmp, ignore_errors=True); return None, None, []
            if cp.returncode != 0:
                text = (err or out).decode("utf-8", "replace")
                await ws.send({"type": "stderr", "data": "\x1b[31m[컴파일 에러]\n%s\x1b[0m\n" % text}); await ws.send({"type": "exit", "data": "", "code": cp.returncode})
                shutil.rmtree(tmp, ignore_errors=True); return None, None, []
        try:
            proc = await asyncio.create_subprocess_exec(*run, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=tmp, env=env, **kw)
        except Exception as e:
            await ws.send({"type": "stderr", "data": "\x1b[31m실행 실패: %s\x1b[0m\n" % e}); await ws.send({"type": "exit", "data": "", "code": 1})
            shutil.rmtree(tmp, ignore_errors=True); return None, None, []
        self.running += 1
        sent = [0]

        async def pipe(stream, kind):
            try:
                while True:
                    chunk = await stream.read(1024)
                    if not chunk:
                        break
                    sent[0] += len(chunk)
                    if sent[0] > OUT_CAP:
                        await ws.send({"type": "stderr", "data": "\n\x1b[33m[출력이 너무 많아서 실행을 중단했어요]\x1b[0m\n"}); kill_tree(proc); break
                    await ws.send({"type": kind, "data": chunk.decode("utf-8", "replace")})
            except Exception:
                pass

        async def watch():
            timed = False
            t1, t2 = asyncio.ensure_future(pipe(proc.stdout, "stdout")), asyncio.ensure_future(pipe(proc.stderr, "stderr"))
            try:
                await asyncio.wait_for(proc.wait(), self.max_seconds)
            except asyncio.TimeoutError:
                timed = True; kill_tree(proc)
                try:
                    await asyncio.wait_for(proc.wait(), 3)
                except Exception:
                    pass
            await asyncio.gather(t1, t2, return_exceptions=True)
            self.running -= 1
            if getattr(proc, "stopped", False):
                return
            code = proc.returncode
            if timed:
                text = "\n\x1b[31m[실행 시간(%d초)을 넘겨서 중단했어요]\x1b[0m\n" % self.max_seconds
            elif code == 0:
                text = "\n\x1b[32m[프로그램 정상 종료]\x1b[0m\n"
            elif code is not None and code < 0:
                text = "\n\x1b[31m[프로그램이 강제로 종료됐어요 (신호 %d)]\x1b[0m\n" % -code
            else:
                text = "\n\x1b[31m[프로그램 종료 (코드: %s)]\x1b[0m\n" % code
            try:
                await ws.send({"type": "exit", "data": text, "code": -1 if timed else code})
            except Closed:
                pass
        return proc, tmp, [asyncio.ensure_future(watch())]


def load_token(reset=False):
    d = _home(".duresync-runner")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "token")
    if not reset and os.path.exists(p):
        t = open(p, encoding="utf-8").read().strip()
        if len(t) >= 16:
            return t
    t = "-".join(secrets.token_hex(2) for _ in range(4)).upper()
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(t)
    return t


# ============================================================ 컴퓨터를 켤 때 자동으로 켜기
AUTOSTART_LABEL = "cloud.duresync.runner"


def _xml(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def autostart_plan(system, home, py, script, args, uid=0, has_systemd=True, appdata=None):
    """운영체제별로 '자동 시작'에 필요한 파일과 명령을 정한다 (실제로 쓰지는 않는다 → 테스트·미리보기에 쓴다).
    {files:[(경로, 내용)], start:[명령…], stop:[명령…], remove:[경로…], note:'…'}"""
    argv = [py, script] + list(args)
    logp = os.path.join(home, ".duresync-runner", "runner.log")
    if system == "Darwin":
        plist = os.path.join(home, "Library", "LaunchAgents", AUTOSTART_LABEL + ".plist")
        body = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'
                "<key>Label</key><string>%s</string>\n<key>ProgramArguments</key><array>%s</array>\n<key>RunAtLoad</key><true/>\n"
                "<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>\n<key>ThrottleInterval</key><integer>15</integer>\n"
                "<key>StandardOutPath</key><string>%s</string>\n<key>StandardErrorPath</key><string>%s</string>\n</dict></plist>\n"
                % (AUTOSTART_LABEL, "".join("<string>%s</string>" % _xml(a) for a in argv), _xml(logp), _xml(logp)))
        return {"files": [(plist, body)],
                "start": [["launchctl", "bootout", "gui/%d/%s" % (uid, AUTOSTART_LABEL)], ["launchctl", "bootstrap", "gui/%d" % uid, plist]],
                "stop": [["launchctl", "bootout", "gui/%d/%s" % (uid, AUTOSTART_LABEL)]],
                "remove": [plist], "note": "맥: 로그인할 때마다 자동으로 켜져요 (로그: %s)" % logp}
    if system == "Windows":
        startup = os.path.join(appdata or os.path.join(home, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
        vbs = os.path.join(startup, "DureSync Runner.vbs")
        quoted = " ".join('""%s""' % a for a in argv)                 # VBScript 문자열 안의 큰따옴표는 두 번
        body = 'CreateObject("WScript.Shell").Run "%s", 0, False\r\n' % quoted
        return {"files": [(vbs, body)], "start": [["wscript", vbs]], "stop": [], "remove": [vbs],
                "note": "윈도우: 로그인할 때마다 창 없이 자동으로 켜져요. 끄려면 --uninstall-autostart 후 작업 관리자에서 python 을 끝내거나 다시 시작하세요."}
    if has_systemd:
        unit = os.path.join(home, ".config", "systemd", "user", "duresync-runner.service")
        qa = " ".join('"%s"' % a.replace('"', '\\"') for a in argv)
        body = "[Unit]\nDescription=DureSync runner\n\n[Service]\nExecStart=%s\nRestart=on-failure\nRestartSec=15\n\n[Install]\nWantedBy=default.target\n" % qa
        return {"files": [(unit, body)],
                "start": [["systemctl", "--user", "daemon-reload"], ["systemctl", "--user", "enable", "--now", "duresync-runner.service"]],
                "stop": [["systemctl", "--user", "disable", "--now", "duresync-runner.service"]], "remove": [unit],
                "note": "리눅스: 로그인할 때마다 자동으로 켜져요 (systemd --user)"}
    desk = os.path.join(home, ".config", "autostart", "duresync-runner.desktop")
    body = "[Desktop Entry]\nType=Application\nName=DureSync Runner\nExec=%s\nTerminal=false\n" % " ".join('"%s"' % a for a in argv)
    return {"files": [(desk, body)], "start": [argv], "stop": [], "remove": [desk], "note": "리눅스: 로그인할 때마다 자동으로 켜져요"}


def _app_args(a):
    out = ["--port", str(a.port)]
    for o in a.allow_origin:
        out += ["--allow-origin", o]
    if a.max_seconds != 300:
        out += ["--max-seconds", str(a.max_seconds)]
    return out


def _uid():
    return os.getuid() if hasattr(os, "getuid") else 0


def autostart_install(a, dry=False):
    home = os.path.expanduser("~")
    d = os.path.join(home, ".duresync-runner")
    dest = os.path.join(d, "duresync_runner.py")
    py = sys.executable or "python3"
    if IS_WINDOWS:                                                    # 창이 안 뜨도록 pythonw
        pw = os.path.join(os.path.dirname(py), "pythonw.exe")
        if os.path.exists(pw):
            py = pw
    system = platform.system()
    plan = autostart_plan(system, home, py, dest, _app_args(a), uid=_uid(), has_systemd=bool(shutil.which("systemctl")), appdata=os.environ.get("APPDATA"))
    print("자동 시작을 켜요:  " + plan["note"])
    for f, _ in plan["files"]:
        print("  · 만들 파일:", f)
    if dry:
        print("(미리보기: 실제로는 아무것도 바꾸지 않았어요)"); return 0
    os.makedirs(d, exist_ok=True)
    if os.path.abspath(__file__) != os.path.abspath(dest):             # 이 파일을 고정된 자리에 복사해 둔다 (내려받은 폴더를 지워도 계속 동작)
        shutil.copyfile(os.path.abspath(__file__), dest)
        os.chmod(dest, 0o700)
    for f, body in plan["files"]:
        os.makedirs(os.path.dirname(f), exist_ok=True)
        with open(f, "w", encoding="utf-8", newline="") as fh:
            fh.write(body)
    for cmd in plan["start"]:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if r.returncode and not (len(cmd) > 1 and cmd[1] == "bootout"):
                print("  ! %s: %s" % (" ".join(cmd[:3]), (r.stderr or r.stdout).strip()[:200]))
        except Exception as e:
            print("  ! %s 실패: %s" % (cmd[0], e))
    print("완료! 지금부터 컴퓨터를 켤 때마다 러너가 알아서 켜져요. 연결 코드:  %s" % load_token())
    print("(끄려면:  python3 %s --uninstall-autostart)" % dest)
    return 0


def autostart_uninstall():
    home = os.path.expanduser("~")
    plan = autostart_plan(platform.system(), home, sys.executable or "python3", os.path.join(home, ".duresync-runner", "duresync_runner.py"), [],
                          uid=_uid(), has_systemd=bool(shutil.which("systemctl")), appdata=os.environ.get("APPDATA"))
    found = [f for f in plan["remove"] if os.path.exists(f)]
    if not found:                                                        # 등록한 적이 없으면 운영체제 설정(launchctl 등)을 건드리지 않는다
        print("자동 시작이 켜져 있지 않았어요."); return 0
    for cmd in plan["stop"]:
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        except Exception:
            pass
    for f in found:
        os.remove(f)
    print("자동 시작을 껐어요.")
    return 0


def main():
    for st in (sys.stdout, sys.stderr):                    # 윈도우 한국어 콘솔(cp949)은 일부 기호를 못 찍어서 죽으므로, 못 찍는 글자는 ? 로 바꿔서라도 계속 간다
        try:
            st.reconfigure(errors="replace")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="DureSync 러너: 내 컴퓨터에 설치한 언어로 워크스페이스 코드를 실행합니다.")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--allow-origin", action="append", default=[], help="믿을 웹사이트 주소를 더 추가 (예: http://localhost:8000)")
    ap.add_argument("--max-seconds", type=int, default=300, help="한 번 실행의 최대 시간(초)")
    ap.add_argument("--show-token", action="store_true", help="연결 코드만 보여 주고 끝내기")
    ap.add_argument("--reset-token", action="store_true", help="연결 코드를 새로 만들기")
    ap.add_argument("--install-autostart", action="store_true", help="컴퓨터를 켤 때마다 러너가 자동으로 켜지게 하기")
    ap.add_argument("--uninstall-autostart", action="store_true", help="자동 시작 끄기")
    ap.add_argument("--dry-run", action="store_true", help="(자동 시작 미리보기) 아무것도 바꾸지 않고 무엇을 할지만 보여 주기")
    ap.add_argument("--allow-no-origin", action="store_true", help="(개발·테스트용) Origin 이 없는 클라이언트도 허용")
    a = ap.parse_args()
    if a.uninstall_autostart:
        return autostart_uninstall()
    token = load_token(a.reset_token)
    if a.show_token:
        print(token); return 0
    origins = [o.rstrip("/") for o in ALLOWED_ORIGINS + a.allow_origin if o and not o.startswith("__")]
    if not origins:
        print("[오류] 믿을 웹사이트가 정해지지 않았어요. 웹사이트에서 내려받은 파일을 쓰거나 --allow-origin 으로 주소를 알려 주세요."); return 2
    if a.install_autostart:
        return autostart_install(a, a.dry_run)
    runner = Runner(a.port, origins, token, max(5, a.max_seconds), a.allow_no_origin)

    async def run():
        await runner.rescan()
        try:
            server = await asyncio.start_server(runner.handle, "127.0.0.1", a.port)
        except OSError as e:
            print("러너가 이미 켜져 있어요 (포트 %d). 이 창은 닫아도 돼요." % a.port); return 0
        print("=" * 62)
        print("  DureSync 러너 %s  - 내 컴퓨터에서 코드를 실행해요" % RUNNER_VERSION)
        print("=" * 62)
        print("  연결 코드 :  %s      (웹사이트의 '내 PC 연결'에 입력하세요)" % token)
        print("  믿는 사이트:  %s" % ", ".join(origins))
        print("  이 컴퓨터에서 찾은 언어:")
        for lang, items in runner.inv.items():
            print("    · %-11s %s" % (LABELS.get(lang, lang), ", ".join(i["version"] or "?" for i in items)))
        if not runner.inv:
            print("    (없음 - Python · Node · Java · gcc 등을 설치한 뒤 다시 켜 주세요)")
        print("  멈추려면 Ctrl+C.  [주의] 코드는 내 컴퓨터에서 내 권한으로 실행돼요. 믿을 수 있는 코드만 실행하세요.")
        print("=" * 62, flush=True)
        async with server:
            await server.serve_forever()
    try:
        return asyncio.run(run()) or 0
    except KeyboardInterrupt:
        print("\n러너를 껐어요."); return 0


if __name__ == "__main__":
    sys.exit(main())
