# -*- coding: utf-8 -*-
"""언어(런타임) 설치·삭제 — 관리자 페이지와 서버 터미널의 `install-lang` 이 같이 쓴다.

같은 언어의 여러 버전을 LANGS_DIR/<런타임>/<버전>/ 에 나란히 설치한다 (Node · Java · .NET(C#) · Go · Rust).
공식 배포처(nodejs.org · adoptium.net · dot.net · go.dev · static.rust-lang.org)에서 HTTPS 로 받고, 체크섬을 제공하는 곳은 확인한 뒤 설치한다.
표준 라이브러리만 쓴다.
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
import time
import urllib.request
from typing import Callable, Dict, List, Optional

from services import lang_registry as reg

LANGS_DIR = reg.LANGS_DIR
ARCH = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower())
ALIASES = {"golang": "go", "rs": "rust", "csharp": "dotnet", "c#": "dotnet", "cs": "dotnet", ".net": "dotnet", "net": "dotnet", "nodejs": "node",
           "javascript": "node", "js": "node", "typescript": "node", "ts": "node", "jdk": "java"}
UA = {"User-Agent": "duresync-install-lang/2.0"}
Log = Callable[[str], None]


class InstallError(Exception):
    pass


def _fetch(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def _json(url: str, timeout: int = 60):
    return json.loads(_fetch(url, timeout).decode("utf-8"))


def _download(url: str, dest: str, sha256: Optional[str], log: Log) -> None:
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(dest, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got, last = 0, -1
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk); h.update(chunk); got += len(chunk)
            if total:
                pct = got * 100 // total // 10 * 10
                if pct != last:
                    last = pct
                    log(f"   내려받는 중… {pct}%  ({got // (1 << 20)}MB / {total // (1 << 20)}MB)")
    if sha256 and h.hexdigest().lower() != sha256.lower():
        raise InstallError("내려받은 파일의 체크섬이 달라요(파일이 깨졌거나 바뀌었을 수 있어요).")


def _safe_extract(archive: str, dest: str) -> None:
    with tarfile.open(archive) as t:
        root = os.path.realpath(dest)
        for m in t.getmembers():
            target = os.path.realpath(os.path.join(dest, m.name))
            if not (target == root or target.startswith(root + os.sep)) or (m.issym() and os.path.isabs(m.linkname)):
                raise InstallError(f"압축 파일 안에 위험한 경로가 있어요: {m.name}")
        try:
            t.extractall(dest, filter="data")
        except TypeError:
            t.extractall(dest)


def _need_space(mb: int) -> None:
    os.makedirs(LANGS_DIR, exist_ok=True)
    free = shutil.disk_usage(LANGS_DIR).free // (1 << 20)
    if free < mb:
        raise InstallError(f"디스크 여유 공간이 부족해요 (필요 약 {mb}MB, 남은 공간 {free}MB).")


def _place(rt: str, vid: str, staged: str) -> str:
    """임시 폴더를 LANGS_DIR/<런타임>/<버전>/ 으로 옮긴다 (같은 버전이 있으면 새 것이 준비된 뒤에 교체)"""
    if not reg.ID_RE.match(vid):
        raise InstallError(f"버전 이름이 올바르지 않아요: {vid}")
    base = os.path.join(LANGS_DIR, rt)
    os.makedirs(base, exist_ok=True)
    final = os.path.join(base, vid)
    old = final + ".old"
    shutil.rmtree(old, ignore_errors=True)
    if os.path.exists(final):
        os.replace(final, old)
    os.replace(staged, final)
    shutil.rmtree(old, ignore_errors=True)
    return final


def _flatten(tmp: str, prefix_hint: str) -> str:
    """압축을 풀면 생기는 최상위 폴더(예: node-v22-linux-x64/)를 찾아 돌려준다"""
    for name in os.listdir(tmp):
        d = os.path.join(tmp, name)
        if os.path.isdir(d):
            return d
    raise InstallError("압축 파일 안에서 설치 폴더를 찾지 못했어요.")


# ---------------------------------------------------------------- 설치할 수 있는 버전 목록 (관리자 화면의 선택 목록)
_avail_cache: Dict[str, tuple] = {}


def available(name: str) -> List[Dict]:
    """[{version, label}] — 최신 것이 앞. 인터넷에서 받아 10분간 기억해 둔다"""
    name = ALIASES.get(name, name)
    hit = _avail_cache.get(name)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    out: List[Dict] = []
    if name == "node":
        rows = _json("https://nodejs.org/dist/index.json")
        seen = set()
        for r in rows:
            if not r.get("lts"):
                continue
            major = r["version"].lstrip("v").split(".")[0]
            if major in seen:
                continue
            seen.add(major)
            out.append({"version": r["version"].lstrip("v"), "label": f"Node.js {major} LTS ({r['version'].lstrip('v')})"})
            if len(out) >= 3:
                break
    elif name == "java":
        rel = _json("https://api.adoptium.net/v3/info/available_releases")
        for major in sorted(rel.get("available_lts_releases", []), reverse=True)[:3]:
            out.append({"version": str(major), "label": f"Java {major} LTS (Temurin)"})
    elif name == "go":
        rows = _json("https://go.dev/dl/?mode=json")
        seen = set()
        for r in rows:
            v = r["version"][2:]
            minor = ".".join(v.split(".")[:2])
            if r.get("stable") and minor not in seen:
                seen.add(minor)
                out.append({"version": v, "label": f"Go {v}"})
            if len(out) >= 3:
                break
    elif name == "rust":
        out = [{"version": "stable", "label": "Rust 최신 안정판"}]
    elif name == "dotnet":
        rows = _json("https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json")["releases-index"]
        for r in rows:
            if r.get("support-phase") in ("active", "maintenance", "go-live") or r.get("release-type") == "lts":
                out.append({"version": r["channel-version"], "label": f".NET {r['channel-version']} ({'LTS' if r.get('release-type') == 'lts' else 'STS'}, SDK {r.get('latest-sdk', '')})"})
            if len(out) >= 3:
                break
    else:
        raise InstallError(f"설치할 수 있는 언어가 아니에요: {name}")
    _avail_cache[name] = (time.time(), out)
    return out


# ---------------------------------------------------------------- 런타임별 설치
def _install_node(version: Optional[str], log: Log) -> str:
    if not ARCH:
        raise InstallError(f"지원하지 않는 CPU 구조예요: {platform.machine()}")
    log("▶ Node.js 설치 정보를 확인하는 중…")
    rows = _json("https://nodejs.org/dist/index.json")
    want = (version or "").lstrip("v")
    row = next((r for r in rows if (r["version"].lstrip("v") == want if want.count(".") >= 2 else (r["version"].lstrip("v").split(".")[0] == want.split(".")[0] if want else bool(r.get("lts"))))), None)
    if not row:
        raise InstallError(f"Node.js {version or '(최신 LTS)'} 버전을 찾지 못했어요.")
    v = row["version"]
    arch = "x64" if ARCH == "amd64" else "arm64"
    fname = f"node-{v}-linux-{arch}.tar.xz"
    sums = _fetch(f"https://nodejs.org/dist/{v}/SHASUMS256.txt").decode()
    sha = next((l.split()[0] for l in sums.splitlines() if l.endswith(" " + fname)), None)
    if not sha:
        raise InstallError("체크섬을 찾지 못했어요.")
    _need_space(500)
    log(f"▶ Node.js {v.lstrip('v')} 설치")
    tmp = tempfile.mkdtemp(prefix=".tmp-node-", dir=LANGS_DIR)
    try:
        arc = os.path.join(tmp, fname)
        _download(f"https://nodejs.org/dist/{v}/{fname}", arc, sha, log)
        log("   압축 푸는 중…")
        _safe_extract(arc, tmp); os.remove(arc)
        _place("node", v.lstrip("v"), _flatten(tmp, "node-"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return v.lstrip("v")


def _install_java(version: Optional[str], log: Log) -> str:
    if not ARCH:
        raise InstallError(f"지원하지 않는 CPU 구조예요: {platform.machine()}")
    log("▶ Java(JDK) 설치 정보를 확인하는 중…")
    rel = _json("https://api.adoptium.net/v3/info/available_releases")
    major = re.match(r"(\d+)", version or "")
    major = int(major.group(1)) if major else rel.get("most_recent_lts")
    arch = "x64" if ARCH == "amd64" else "aarch64"
    assets = _json(f"https://api.adoptium.net/v3/assets/latest/{major}/hotspot?architecture={arch}&image_type=jdk&os=linux&vendor=eclipse")
    a = next((x for x in assets if x.get("binary", {}).get("package", {}).get("link", "").endswith((".tar.gz", ".tgz"))), None)
    if not a:
        raise InstallError(f"Java {major} 를 찾지 못했어요.")
    pkg = a["binary"]["package"]
    vid = a.get("version", {}).get("semver") or str(major)
    _need_space(int(pkg.get("size", 200_000_000) // (1 << 20)) * 3 + 300)
    log(f"▶ Java {vid} 설치 ({pkg.get('size', 0) // (1 << 20)}MB)")
    tmp = tempfile.mkdtemp(prefix=".tmp-java-", dir=LANGS_DIR)
    try:
        arc = os.path.join(tmp, "jdk.tar.gz")
        _download(pkg["link"], arc, pkg.get("checksum"), log)
        log("   압축 푸는 중…")
        _safe_extract(arc, tmp); os.remove(arc)
        _place("java", vid, _flatten(tmp, "jdk"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return vid


def _install_go(version: Optional[str], log: Log) -> str:
    if not ARCH:
        raise InstallError(f"지원하지 않는 CPU 구조예요: {platform.machine()}")
    log("▶ Go 설치 정보를 확인하는 중…")
    rows = _json("https://go.dev/dl/?mode=json&include=all" if version else "https://go.dev/dl/?mode=json")
    want = ("go" + version) if version else None
    rel = next((r for r in rows if (r["version"] == want if want else r.get("stable"))), None)
    if not rel:
        raise InstallError(f"Go {version or '(최신)'} 버전을 찾지 못했어요.")
    f = next((x for x in rel["files"] if x["os"] == "linux" and x["arch"] == ARCH and x["kind"] == "archive"), None)
    if not f:
        raise InstallError("이 컴퓨터용 Go 파일을 찾지 못했어요.")
    _need_space(int(f["size"] // (1 << 20)) * 4 + 300)
    v = rel["version"][2:]
    log(f"▶ Go {v} 설치 ({f['size'] // (1 << 20)}MB)")
    tmp = tempfile.mkdtemp(prefix=".tmp-go-", dir=LANGS_DIR)
    try:
        arc = os.path.join(tmp, f["filename"])
        _download("https://go.dev/dl/" + f["filename"], arc, f["sha256"], log)
        log("   압축 푸는 중…")
        _safe_extract(arc, tmp); os.remove(arc)
        final = _place("go", v, os.path.join(tmp, "go"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    log("   표준 라이브러리를 미리 컴파일하는 중(첫 실행을 빠르게, 1~2분)…")
    cache = os.path.join(LANGS_DIR, ".gocache")
    os.makedirs(cache, exist_ok=True)
    subprocess.run([os.path.join(final, "bin", "go"), "build", "std"], env=dict(os.environ, GOCACHE=cache, GOFLAGS="-mod=mod", HOME=cache), timeout=900, capture_output=True)
    return v


def _install_rust(version: Optional[str], log: Log) -> str:
    triple = {"amd64": "x86_64-unknown-linux-gnu", "arm64": "aarch64-unknown-linux-gnu"}.get(ARCH or "")
    if not triple:
        raise InstallError(f"지원하지 않는 CPU 구조예요: {platform.machine()}")
    try:
        import tomllib
    except ImportError:
        raise InstallError("Python 3.11 이상이 필요해요 (서버 컨테이너 안에서 실행하세요).")
    log("▶ Rust 설치 정보를 확인하는 중…")
    chan = version if version and version != "latest" else "stable"
    try:
        man = tomllib.loads(_fetch(f"https://static.rust-lang.org/dist/channel-rust-{chan}.toml", 120).decode("utf-8"))
    except Exception as e:
        raise InstallError(f"Rust {chan} 정보를 불러오지 못했어요: {e}")
    ver = str(man["pkg"]["rust"]["version"]).split(" ")[0]
    parts = []
    for comp in ("rustc", "rust-std"):
        t = man["pkg"][comp]["target"].get(triple)
        if not t or not t.get("available"):
            raise InstallError(f"{comp} ({triple}) 를 찾지 못했어요.")
        parts.append((comp, t["xz_url"], t["xz_hash"]))
    _need_space(1500)
    log(f"▶ Rust {ver} 설치 (rustc + 표준 라이브러리)")
    tmp = tempfile.mkdtemp(prefix=".tmp-rust-", dir=LANGS_DIR)
    try:
        prefix = os.path.join(tmp, "rust")
        for comp, u, h in parts:
            arc = os.path.join(tmp, comp + ".tar.xz")
            log(f"   {comp}")
            _download(u, arc, h, log)
            _safe_extract(arc, tmp); os.remove(arc)
            d = next(os.path.join(tmp, x) for x in os.listdir(tmp) if x.startswith(comp + "-") and os.path.isdir(os.path.join(tmp, x)))
            r = subprocess.run(["sh", "install.sh", f"--prefix={prefix}", "--disable-ldconfig"], cwd=d, capture_output=True, text=True)
            if r.returncode != 0:
                raise InstallError(f"{comp} 설치에 실패했어요:\n{(r.stderr or r.stdout)[-600:]}")
            shutil.rmtree(d, ignore_errors=True)
        _place("rust", ver, prefix)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return ver


def _install_dotnet(version: Optional[str], log: Log) -> str:
    log("▶ .NET SDK(C#) 설치: Microsoft 공식 설치 스크립트를 내려받는 중…")
    _need_space(1800)
    tmp = tempfile.mkdtemp(prefix=".tmp-dotnet-", dir=LANGS_DIR)
    try:
        script = os.path.join(tmp, "dotnet-install.sh")
        _download("https://dot.net/v1/dotnet-install.sh", script, None, log)
        dst = os.path.join(tmp, "dotnet")
        args = ["bash", script, "--install-dir", dst, "--no-path", "--channel", version if version else "LTS"]
        log("   .NET SDK 를 내려받아 설치하는 중(1~3분)…")
        r = subprocess.run(args, text=True, capture_output=True)
        if r.returncode != 0 or not os.path.exists(os.path.join(dst, "dotnet")):
            raise InstallError("설치에 실패했어요:\n" + (r.stderr or r.stdout)[-800:])
        sdk = sorted(os.listdir(os.path.join(dst, "sdk")))[-1]
        _place("dotnet", sdk, dst)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return sdk


INSTALLERS = {"node": _install_node, "java": _install_java, "go": _install_go, "rust": _install_rust, "dotnet": _install_dotnet}


def install(name: str, version: Optional[str] = None, log: Log = print) -> str:
    """설치하고 설치된 버전 id 를 돌려준다. 문제가 있으면 InstallError"""
    name = ALIASES.get(name, name)
    if name not in INSTALLERS:
        raise InstallError(f"설치할 수 있는 언어가 아니에요: {name}  ({', '.join(INSTALLERS)})")
    if version and not re.fullmatch(r"[0-9A-Za-z.+_-]*", version):
        raise InstallError("버전 표기가 올바르지 않아요. 예: 22 또는 1.23.4")
    os.makedirs(LANGS_DIR, exist_ok=True)
    try:
        vid = INSTALLERS[name](version or None, log)
    except InstallError:
        raise
    except Exception as e:
        raise InstallError(f"설치 중 문제가 생겼어요: {e}")
    if not any(v["id"] == vid for v in reg.list_versions(name)):
        raise InstallError("설치는 끝났지만 실행 확인에 실패했어요.")
    return vid
