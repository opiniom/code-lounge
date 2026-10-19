#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""서버에서 코드 실행용 언어를 나중에 설치/삭제하는 도구 (재빌드·재시작 필요 없음).

  docker compose -f docker-compose.prod.yml exec app install-lang list          설치 현황
  docker compose -f docker-compose.prod.yml exec app install-lang go            Go 설치 (최신)
  docker compose -f docker-compose.prod.yml exec app install-lang rust 1.85.0   Rust (버전 지정도 가능)
  docker compose -f docker-compose.prod.yml exec app install-lang dotnet        C# (.NET SDK)
  docker compose -f docker-compose.prod.yml exec app install-lang remove go     삭제

설치한 언어는 LANGS_DIR(기본 /opt/langs, 도커 볼륨 ./langs)에 들어가서 컨테이너를 새로 만들어도 남고,
서버가 10초 안에 자동으로 알아봐서 /health 의 supported_languages 와 워크스페이스 ▶ 실행에 바로 나타난다.
표준 라이브러리만 쓰고, 공식 배포처에서 HTTPS 로 받아 체크섬을 확인한 뒤 설치한다.
"""
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

LANGS_DIR = os.environ.get("LANGS_DIR", "/opt/langs")
ARCH = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower())
RUST_TRIPLE = {"amd64": "x86_64-unknown-linux-gnu", "arm64": "aarch64-unknown-linux-gnu"}.get(ARCH or "")
ALIASES = {"golang": "go", "rs": "rust", "csharp": "dotnet", "c#": "dotnet", "cs": "dotnet", ".net": "dotnet", "net": "dotnet"}
TOOLS = {
    "go": ("Go", "bin/go", ["version"]),
    "rust": ("Rust", "bin/rustc", ["--version"]),
    "dotnet": ("C# (.NET SDK)", "dotnet", ["--version"]),
}
UA = {"User-Agent": "duresync-install-lang/1.0"}


def say(msg=""):
    print(msg, flush=True)


def die(msg, code=1):
    print("✗ " + msg, file=sys.stderr, flush=True)
    sys.exit(code)


def fetch(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def download(url, dest, sha256=None):
    """진행률을 보여 주며 내려받고, sha256 이 주어지면 맞는지 확인한다"""
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(dest, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got, last = 0, -1
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            h.update(chunk)
            got += len(chunk)
            if total:
                pct = got * 100 // total // 10 * 10
                if pct != last:
                    last = pct
                    say(f"   내려받는 중… {pct}%  ({got // (1 << 20)}MB / {total // (1 << 20)}MB)")
    if sha256 and h.hexdigest().lower() != sha256.lower():
        die(f"내려받은 파일의 체크섬이 달라요(파일이 깨졌거나 바뀌었을 수 있어요): {url}")


def safe_extract(archive, dest):
    with tarfile.open(archive) as t:
        root = os.path.realpath(dest)
        for m in t.getmembers():
            target = os.path.realpath(os.path.join(dest, m.name))
            if not (target == root or target.startswith(root + os.sep)) or m.issym() and os.path.isabs(m.linkname):
                die(f"압축 파일 안에 위험한 경로가 있어요: {m.name}")
        try:
            t.extractall(dest, filter="data")
        except TypeError:
            t.extractall(dest)


def need_space(mb):
    os.makedirs(LANGS_DIR, exist_ok=True)
    free = shutil.disk_usage(LANGS_DIR).free // (1 << 20)
    if free < mb:
        die(f"디스크 여유 공간이 부족해요 (필요 약 {mb}MB, 남은 공간 {free}MB).")


def finalize(name, staged):
    """임시 폴더를 최종 위치로 교체 (옛 버전이 있으면 새 것이 준비된 뒤에 바꾼다)"""
    final = os.path.join(LANGS_DIR, name)
    old = final + ".old"
    shutil.rmtree(old, ignore_errors=True)
    if os.path.exists(final):
        os.replace(final, old)
    os.replace(staged, final)
    shutil.rmtree(old, ignore_errors=True)
    return final


def version_of(name):
    label, rel, args = TOOLS[name]
    exe = os.path.join(LANGS_DIR, name, rel)
    if not os.path.exists(exe):
        return None
    try:
        out = subprocess.run([exe] + args, capture_output=True, text=True, timeout=20, env=dict(os.environ, DOTNET_NOLOGO="1", DOTNET_CLI_TELEMETRY_OPTOUT="1", DOTNET_SYSTEM_GLOBALIZATION_INVARIANT="1"))
        return (out.stdout or out.stderr).strip().splitlines()[0]
    except Exception as e:
        return f"실행 확인 실패({e})"


# ---------------- Go ----------------
def install_go(version):
    if not ARCH:
        die(f"지원하지 않는 CPU 구조예요: {platform.machine()}")
    say("▶ Go 설치 정보를 확인하는 중…")
    releases = json.loads(fetch("https://go.dev/dl/?mode=json&include=all" if version else "https://go.dev/dl/?mode=json"))
    want = ("go" + version) if version else None
    rel = next((r for r in releases if (r["version"] == want if want else r.get("stable"))), None)
    if not rel:
        die(f"Go {version or '(최신)'} 버전을 찾지 못했어요.")
    f = next((x for x in rel["files"] if x["os"] == "linux" and x["arch"] == ARCH and x["kind"] == "archive"), None)
    if not f:
        die("이 컴퓨터용 Go 파일을 찾지 못했어요.")
    need_space(int(f["size"] // (1 << 20)) * 4 + 300)
    say(f"▶ {rel['version']} ({f['size'] // (1 << 20)}MB) 설치")
    tmp = tempfile.mkdtemp(prefix=".tmp-go-", dir=LANGS_DIR)
    try:
        arc = os.path.join(tmp, f["filename"])
        download("https://go.dev/dl/" + f["filename"], arc, f["sha256"])
        say("   압축 푸는 중…")
        safe_extract(arc, tmp)
        os.remove(arc)
        final = finalize("go", os.path.join(tmp, "go"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    say("   표준 라이브러리를 미리 컴파일하는 중(첫 실행을 빠르게, 1~2분)…")
    cache = os.path.join(LANGS_DIR, ".gocache")
    os.makedirs(cache, exist_ok=True)
    subprocess.run([os.path.join(final, "bin", "go"), "build", "std"], env=dict(os.environ, GOCACHE=cache, GOFLAGS="-mod=mod", HOME=cache), timeout=900, capture_output=True)


# ---------------- Rust ----------------
def install_rust(version):
    if not RUST_TRIPLE:
        die(f"지원하지 않는 CPU 구조예요: {platform.machine()}")
    try:
        import tomllib
    except ImportError:
        die("Python 3.11 이상이 필요해요 (서버 컨테이너 안에서 실행하세요).")
    say("▶ Rust 설치 정보를 확인하는 중…")
    chan = version if version else "stable"
    url = f"https://static.rust-lang.org/dist/channel-rust-{chan}.toml"
    try:
        man = tomllib.loads(fetch(url, 120).decode("utf-8"))
    except Exception as e:
        die(f"Rust {chan} 정보를 불러오지 못했어요: {e}")
    ver = str(man["pkg"]["rust"]["version"]).split(" ")[0]
    parts = []
    for comp in ("rustc", "rust-std"):
        t = man["pkg"][comp]["target"].get(RUST_TRIPLE)
        if not t or not t.get("available"):
            die(f"{comp} ({RUST_TRIPLE}) 를 찾지 못했어요.")
        parts.append((comp, t["xz_url"], t["xz_hash"]))
    need_space(1500)
    say(f"▶ Rust {ver} 설치 (rustc + 표준 라이브러리)")
    tmp = tempfile.mkdtemp(prefix=".tmp-rust-", dir=LANGS_DIR)
    try:
        prefix = os.path.join(tmp, "rust")
        for comp, u, h in parts:
            arc = os.path.join(tmp, comp + ".tar.xz")
            say(f"   {comp}")
            download(u, arc, h)
            safe_extract(arc, tmp)
            os.remove(arc)
            d = next(os.path.join(tmp, x) for x in os.listdir(tmp) if x.startswith(comp + "-") and os.path.isdir(os.path.join(tmp, x)))
            r = subprocess.run(["sh", "install.sh", f"--prefix={prefix}", "--disable-ldconfig"], cwd=d, capture_output=True, text=True)
            if r.returncode != 0:
                die(f"{comp} 설치에 실패했어요:\n{(r.stderr or r.stdout)[-600:]}")
            shutil.rmtree(d, ignore_errors=True)
        finalize("rust", prefix)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not shutil.which("cc") and not shutil.which("gcc"):
        say("⚠ Rust 컴파일에는 C 컴파일러(gcc)가 필요해요. 이미지에 gcc 가 있는지 확인하세요.")


# ---------------- C# (.NET SDK) ----------------
def install_dotnet(version):
    say("▶ .NET SDK(C#) 설치: Microsoft 공식 설치 스크립트를 내려받는 중…")
    need_space(1800)
    tmp = tempfile.mkdtemp(prefix=".tmp-dotnet-", dir=LANGS_DIR)
    try:
        script = os.path.join(tmp, "dotnet-install.sh")
        download("https://dot.net/v1/dotnet-install.sh", script)
        dst = os.path.join(tmp, "dotnet")
        args = ["bash", script, "--install-dir", dst, "--no-path"] + (["--channel", version] if version else ["--channel", "LTS"])
        say("   .NET SDK 를 내려받아 설치하는 중(1~3분)…")
        r = subprocess.run(args, text=True, capture_output=True)
        if r.returncode != 0 or not os.path.exists(os.path.join(dst, "dotnet")):
            die("설치에 실패했어요:\n" + (r.stderr or r.stdout)[-800:])
        finalize("dotnet", dst)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


INSTALLERS = {"go": install_go, "rust": install_rust, "dotnet": install_dotnet}


def cmd_list():
    say(f"설치 위치: {LANGS_DIR}")
    any_ = False
    for name, (label, _, _) in TOOLS.items():
        v = version_of(name)
        say(f"  {'✓' if v else '·'} {label:<16} {v or '설치 안 됨  →  install-lang ' + name}")
        any_ = any_ or bool(v)
    say("\n(이미지에 기본으로 들어 있는 언어: Python · JavaScript · TypeScript · Java · C · C++ · Ruby · PHP · Perl · Bash)")


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        say(__doc__)
        return 0
    cmd = argv[0].lower()
    if cmd == "list":
        cmd_list()
        return 0
    if cmd == "remove":
        if len(argv) < 2:
            die("삭제할 언어를 적어 주세요. 예: install-lang remove go")
        name = ALIASES.get(argv[1].lower(), argv[1].lower())
        if name not in TOOLS:
            die(f"알 수 없는 언어예요: {argv[1]}  (go, rust, dotnet)")
        d = os.path.join(LANGS_DIR, name)
        if not os.path.exists(d):
            say(f"이미 설치돼 있지 않아요: {name}")
            return 0
        shutil.rmtree(d)
        say(f"✓ {TOOLS[name][0]} 를 삭제했어요. 10초 안에 서버가 목록에서 뺍니다.")
        return 0
    name = ALIASES.get(cmd, cmd)
    if name not in INSTALLERS:
        die(f"알 수 없는 언어예요: {argv[0]}  (설치할 수 있는 언어: go, rust, dotnet)  ·  현황은 install-lang list")
    if not re.fullmatch(r"[0-9A-Za-z.+-]*", argv[1] if len(argv) > 1 else ""):
        die("버전 표기가 올바르지 않아요. 예: 1.22.5")
    os.makedirs(LANGS_DIR, exist_ok=True)
    INSTALLERS[name](argv[1] if len(argv) > 1 else None)
    v = version_of(name)
    if not v:
        die("설치는 끝났지만 실행 확인에 실패했어요.")
    say(f"\n✓ 설치 완료: {v}")
    say("  서버가 10초 안에 자동으로 알아봐요. 확인:  curl -s localhost:8000/health   (supported_languages 에 나오면 끝)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
