"""언어(런타임) 관리: 어떤 언어를 사용자에게 열어 둘지(공개), 어떤 버전이 설치돼 있는지, 기본 버전은 무엇인지.

  · 공개 여부: data/languages.json 에 저장 (관리자 페이지 '언어 관리'에서 켜고 끈다). 아직 정하지 않은 언어는 기본 공개 목록(CORE_ENABLED)을 따른다.
  · 설치 위치: LANGS_DIR(/opt/langs, 도커 볼륨) 아래 <런타임>/<버전>/ — 같은 언어의 여러 버전을 나란히 둘 수 있다.
      예) /opt/langs/java/21.0.5/bin/javac , /opt/langs/java/17.0.13/bin/javac , /opt/langs/dotnet/9.0.100/dotnet
      옛 방식(/opt/langs/go/bin/go 처럼 버전 폴더 없이 설치)도 'legacy' 라는 이름의 버전으로 인식한다.
  · 'image' 버전: 도커 이미지에 기본으로 들어 있는 것(시스템 PATH 의 도구).
  · 기본 버전: 관리자가 지정한 것, 없으면 가장 높은 설치 버전, 없으면 이미지 기본.
사용자는 실행할 때 버전을 직접 고를 수 있다(없으면 기본 버전).
"""
import json
import os
import re
import shutil
import subprocess
import threading
from typing import Dict, List, Optional, Tuple

LANGS_DIR = os.environ.get("LANGS_DIR", "/opt/langs")
_DEFAULT_CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "languages.json")
IS_WINDOWS = os.name == "nt"

# 처음부터 사용자에게 열어 두는 핵심 언어 (HTML·CSS 는 서버가 아니라 사용자 브라우저에서 동작하므로 여기에 없다)
CORE_ENABLED = ["python", "javascript", "typescript", "java", "c", "cpp", "csharp"]

# 버전을 여러 개 설치·선택할 수 있는 런타임. langs: 이 런타임을 쓰는 언어들
RUNTIMES: Dict[str, Dict] = {
    "node":   {"label": "Node.js (JavaScript · TypeScript)", "langs": ["javascript", "typescript"], "exes": ["node"], "ver_args": ["--version"]},
    "java":   {"label": "Java (JDK)", "langs": ["java"], "exes": ["javac", "java"], "ver_args": ["--version"], "ver_exe": "javac"},
    "dotnet": {"label": "C# (.NET SDK)", "langs": ["csharp"], "exes": ["dotnet"], "ver_args": ["--version"]},
    "go":     {"label": "Go", "langs": ["go"], "exes": ["go"], "ver_args": ["version"]},
    "rust":   {"label": "Rust", "langs": ["rust"], "exes": ["rustc"], "ver_args": ["--version"]},
}
LANG_RUNTIME = {lang: rt for rt, m in RUNTIMES.items() for lang in m["langs"]}
ID_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._+-]{0,40}$")

_lock = threading.Lock()
_ver_cache: Dict[Tuple[str, float], str] = {}


def config_path() -> str:
    return os.environ.get("LANGS_CONFIG") or _DEFAULT_CFG


def _load() -> Dict:
    try:
        with open(config_path(), "r", encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _save(cfg: Dict) -> None:
    p = config_path()
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


# ---------------------------------------------------------------- 공개 여부
def is_enabled(lang: str) -> bool:
    en = _load().get("enabled") or {}
    return bool(en[lang]) if lang in en else lang in CORE_ENABLED


def set_enabled(lang: str, on: bool) -> None:
    with _lock:
        cfg = _load()
        cfg.setdefault("enabled", {})[lang] = bool(on)
        _save(cfg)


# ---------------------------------------------------------------- 설치된 버전
def _exe_rel(rt: str, exe: str) -> str:
    return exe + (".exe" if IS_WINDOWS else "") if rt == "dotnet" else os.path.join("bin", exe + (".exe" if IS_WINDOWS else ""))


def _runnable(path: str) -> bool:
    return os.path.isfile(path) and os.access(path, os.X_OK)


def _image_exe(exe: str) -> Optional[str]:
    """도커 이미지에 기본으로 들어 있는 도구(시스템 PATH). LANGS_DIR 안의 것은 제외"""
    p = shutil.which(exe)
    if p and os.path.realpath(p).startswith(os.path.realpath(LANGS_DIR) + os.sep):
        return None
    return p


def _version_key(vid: str):
    return tuple(int(x) if x.isdigit() else 0 for x in re.split(r"[.+_-]", vid))


def installed_ids(rt: str) -> List[str]:
    """LANGS_DIR 에 설치된 버전 이름들 (높은 버전 먼저). 옛 방식 설치는 'legacy'"""
    base = os.path.join(LANGS_DIR, rt)
    exe0 = RUNTIMES[rt]["exes"][0]
    out: List[str] = []
    try:
        for name in os.listdir(base):
            if name.startswith(".") or not ID_RE.match(name):
                continue
            if _runnable(os.path.join(base, name, _exe_rel(rt, exe0))):
                out.append(name)
    except OSError:
        pass
    out.sort(key=_version_key, reverse=True)
    if _runnable(os.path.join(base, _exe_rel(rt, exe0))):
        out.append("legacy")
    return out


def exe_in_version(rt: str, vid: Optional[str], exe: str) -> Optional[str]:
    if rt not in RUNTIMES or not vid:
        return None
    if vid == "image":
        return _image_exe(exe)
    if vid != "legacy" and not ID_RE.match(vid):
        return None
    p = os.path.join(LANGS_DIR, rt, _exe_rel(rt, exe)) if vid == "legacy" else os.path.join(LANGS_DIR, rt, vid, _exe_rel(rt, exe))
    return p if _runnable(p) else None


def _vtuple(rt: str, vid: str):
    """버전 비교용 숫자 묶음 (실제 버전 문자열 기준: 25.0.4 > 24.22.0 > 21.0.5)"""
    t = version_text(rt, vid) or vid
    return tuple(int(x) for x in re.findall(r"\d+", t.split("+")[0])[:4]) or (0,)


def default_version(rt: str) -> Optional[str]:
    """관리자가 정한 기본 버전, 없으면 설치된 것(이미지 기본 포함) 중 가장 높은 버전 —
    오래된 버전을 추가로 설치해도 기본이 조용히 내려가지 않게 한다"""
    ids = installed_ids(rt)
    image_ok = bool(_image_exe(RUNTIMES[rt]["exes"][0]))
    want = (_load().get("default") or {}).get(rt)
    if want == "image" and image_ok:
        return "image"
    if want in ids:
        return want
    cands = ids + (["image"] if image_ok else [])
    return max(cands, key=lambda v: _vtuple(rt, v)) if cands else None


def set_default(rt: str, vid: str) -> None:
    with _lock:
        cfg = _load()
        cfg.setdefault("default", {})[rt] = vid
        _save(cfg)


def version_text(rt: str, vid: str) -> str:
    """그 버전의 실제 버전 문자열 (예: 'go1.23.4', '21.0.5'). 실행해서 알아내고 결과는 기억해 둔다"""
    m = RUNTIMES[rt]
    exe = exe_in_version(rt, vid, m.get("ver_exe") or m["exes"][0])
    if not exe:
        return ""
    try:
        key = (exe, os.path.getmtime(exe))
    except OSError:
        return ""
    if key in _ver_cache:
        return _ver_cache[key]
    try:
        r = subprocess.run([exe] + m["ver_args"], capture_output=True, text=True, timeout=15,
                           env={"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "DOTNET_NOLOGO": "1", "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_SYSTEM_GLOBALIZATION_INVARIANT": "1"})
        line = ((r.stdout or r.stderr or "").strip().splitlines() or [""])[0].strip()
    except Exception:
        line = ""
    m_ = re.search(r"(\d+(?:\.\d+){1,3}(?:[+_-][0-9A-Za-z.]+)?)", line)
    text = (m_.group(1) if m_ else line)[:40]
    _ver_cache[key] = text
    return text


def list_versions(rt: str) -> List[Dict]:
    """사용자·관리자 화면용: 이 런타임에서 고를 수 있는 버전들"""
    dflt = default_version(rt)
    out = []
    for vid in installed_ids(rt):
        v = version_text(rt, vid)
        out.append({"id": vid, "version": v, "label": (v or vid) + (" (이전 방식 설치)" if vid == "legacy" else ""), "source": "langs", "active": vid == dflt})
    if _image_exe(RUNTIMES[rt]["exes"][0]):
        v = version_text(rt, "image")
        out.append({"id": "image", "version": v, "label": (v or "기본") + " (기본 포함)", "source": "image", "active": dflt == "image"})
    return out


def remove_version(rt: str, vid: str) -> bool:
    if vid == "image" or rt not in RUNTIMES or (vid != "legacy" and not ID_RE.match(vid)):
        return False
    target = os.path.join(LANGS_DIR, rt) if vid == "legacy" else os.path.join(LANGS_DIR, rt, vid)
    if not os.path.isdir(target):
        return False
    if vid == "legacy":                       # 옛 방식 폴더에는 새 방식 버전 폴더가 같이 있을 수 있으니 실행 파일 쪽만 지운다
        for sub in ("bin", "lib", "pkg", "src", "api", "misc", "share", "test", "sdk", "shared", "host", "packs", "templates"):
            shutil.rmtree(os.path.join(target, sub), ignore_errors=True)
        for exe in RUNTIMES[rt]["exes"]:
            try:
                os.remove(os.path.join(target, _exe_rel(rt, exe)))
            except OSError:
                pass
        try:
            os.rmdir(target)
        except OSError:
            pass
    else:
        shutil.rmtree(target)
    with _lock:
        cfg = _load()
        if (cfg.get("default") or {}).get(rt) == vid:
            cfg["default"].pop(rt, None)
            _save(cfg)
    return True


def runtime_for_lang(lang: str) -> Optional[str]:
    return LANG_RUNTIME.get(lang)
