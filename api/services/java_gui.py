"""자바 GUI(Swing·AWT) 프로그램을 '내 브라우저 안의 창'으로 띄우기 위한 준비 (서버는 컴파일만 한다).

서버에는 화면이 없어서 Swing 프로그램을 직접 돌릴 수 없다. 그래서
  ① 서버가 진짜 javac 로 프로젝트의 .java 파일들을 컴파일해서 .jar 로 묶어 주고,
  ② 브라우저(frontend/gui/frame.html, CheerpJ)가 그 jar 를 실행해서 창을 사이트 안에 그린다.
서버는 사용자 코드를 '실행'하지 않는다 (컴파일만). 컴파일 때도 어노테이션 프로세서(-proc:none)는 끄고, 서버 환경변수는 넘기지 않는다.

브라우저 안의 자바에서 불러올 수 없게 막는 것(보안): 이름으로 클래스를 불러오기·리플렉션·JS 연결(netscape.javascript)·native 메서드.
 → 컴파일된 .class 의 상수 풀을 읽어서 그런 이름이 들어 있으면 거절한다 (일반 Swing 프로그램에는 필요 없는 기능들).
"""
import io
import os
import re
import shutil
import struct
import tempfile
import zipfile
from typing import Dict, List, Optional, Tuple

from services import sandbox_runner as sb

MAX_FILES = 60
MAX_FILE_BYTES = 200 * 1024
MAX_TOTAL_BYTES = 800 * 1024
MAX_JAR_BYTES = 6 * 1024 * 1024
COMPILE_SECONDS = 25.0

# 컴파일된 클래스의 상수 풀에 이 글자가 들어 있으면 거절한다 (대소문자 구분)
FORBIDDEN = ("netscape/javascript", "javax/script", "java/lang/reflect/", "java/lang/ClassLoader", "forName", "loadClass", "defineClass",
             "java/util/ServiceLoader", "java/beans/", "javax/naming", "jdk/internal", "sun/misc", "sun/reflect", "com/leaningtech")
FORBIDDEN_LABEL = {"netscape/javascript": "JS 연결(JSObject)", "javax/script": "스크립트 엔진", "java/lang/reflect/": "리플렉션", "java/lang/ClassLoader": "클래스 로더",
                    "forName": "이름으로 클래스 불러오기(Class.forName)", "loadClass": "클래스 불러오기", "defineClass": "클래스 직접 정의", "java/util/ServiceLoader": "ServiceLoader",
                    "java/beans/": "java.beans", "javax/naming": "javax.naming", "jdk/internal": "JDK 내부 클래스", "sun/misc": "sun.misc", "sun/reflect": "sun.reflect", "com/leaningtech": "CheerpJ 내부"}


class GuiBuildError(Exception):
    """사용자에게 그대로 보여 줄 수 있는 설명"""


def clean_path(p: str) -> Optional[str]:
    p = (p or "").replace("\\", "/")
    if not p.endswith(".java") or p.startswith("/") or ".." in p.split("/") or "\x00" in p or len(p) > 200:
        return None
    if not re.fullmatch(r"[\w.\- /가-힣]+", p):
        return None
    return p


def parse_class(data: bytes) -> Tuple[List[str], bool]:
    """.class 파일에서 (상수 풀의 글자들, native 메서드가 있는지) 만 읽는다. 모양이 이상하면 ValueError"""
    if len(data) < 10 or data[:4] != b"\xca\xfe\xba\xbe":
        raise ValueError("class 파일이 아니에요")
    n = struct.unpack(">H", data[8:10])[0]
    i, strings, idx = 10, [], 1
    sizes = {3: 4, 4: 4, 5: 8, 6: 8, 7: 2, 8: 2, 9: 4, 10: 4, 11: 4, 12: 4, 15: 3, 16: 2, 17: 4, 18: 4, 19: 2, 20: 2}
    while idx < n:
        tag = data[i]; i += 1
        if tag == 1:
            ln = struct.unpack(">H", data[i:i + 2])[0]; i += 2
            strings.append(data[i:i + ln].decode("utf-8", "replace")); i += ln
        elif tag in sizes:
            i += sizes[tag]
            if tag in (5, 6):
                idx += 1
        else:
            raise ValueError("알 수 없는 상수 풀 항목")
        idx += 1
    i += 6                                                        # access, this, super
    ic = struct.unpack(">H", data[i:i + 2])[0]; i += 2 + 2 * ic

    def skip_attrs(i):
        ac = struct.unpack(">H", data[i:i + 2])[0]; i += 2
        for _ in range(ac):
            ln = struct.unpack(">I", data[i + 2:i + 6])[0]; i += 6 + ln
        return i
    native = False
    for kind in ("fields", "methods"):
        cnt = struct.unpack(">H", data[i:i + 2])[0]; i += 2
        for _ in range(cnt):
            acc = struct.unpack(">H", data[i:i + 2])[0]
            if kind == "methods" and acc & 0x0100:
                native = True
            i = skip_attrs(i + 6)
    return strings, native


def check_classes(classes: Dict[str, bytes]) -> List[str]:
    """허용되지 않는 기능을 쓰는 클래스가 있으면 이유 목록을 돌려준다 (없으면 빈 목록)"""
    problems: List[str] = []
    for name, data in classes.items():
        try:
            strings, native = parse_class(data)
        except Exception:
            problems.append(f"{name}: 클래스 파일을 읽을 수 없어요"); continue
        if native:
            problems.append(f"{name}: native 메서드는 쓸 수 없어요")
        blob = "\n".join(strings)
        for bad in FORBIDDEN:
            if bad in blob and bad in FORBIDDEN_LABEL:
                problems.append(f"{name}: {FORBIDDEN_LABEL[bad]} 는 브라우저 GUI 창에서 쓸 수 없어요")
    return sorted(set(problems))


def make_jar(classes: Dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(classes.items()):
            z.writestr(name, data)
    return buf.getvalue()


async def build(files: List[Dict[str, str]], main_class: str) -> Dict[str, object]:
    """{ok, jar(bytes), main} 또는 {ok:False, errors:'컴파일 오류 글'}. 사용자가 잘못 쓴 건 GuiBuildError 로 알린다."""
    if not files or len(files) > MAX_FILES:
        raise GuiBuildError(f"자바 파일은 1~{MAX_FILES}개까지 보낼 수 있어요.")
    if not re.fullmatch(r"(?:[^\W\d]|\$)[\w$]*(?:\.(?:[^\W\d]|\$)[\w$]*)*", main_class or ""):
        raise GuiBuildError("실행할 클래스(main)를 찾지 못했어요.")
    total, entries = 0, []
    for f in files:
        p = clean_path(str(f.get("path", "")))
        c = str(f.get("content", ""))
        if not p:
            raise GuiBuildError(f"파일 이름을 쓸 수 없어요: {f.get('path')}")
        b = len(c.encode("utf-8")); total += b
        if b > MAX_FILE_BYTES or total > MAX_TOTAL_BYTES:
            raise GuiBuildError("코드가 너무 커요 (파일 하나 200KB, 전체 800KB 까지).")
        entries.append((p, c))
    javac = sb.tool("javac")
    if not javac:
        raise GuiBuildError("이 서버에는 자바 컴파일러가 없어요.")
    tmp = tempfile.mkdtemp(prefix="gui_build_")
    try:
        src, out = os.path.join(tmp, "src"), os.path.join(tmp, "out")
        os.makedirs(out)
        rel = []
        for p, c in entries:
            fp = os.path.join(src, p)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            with open(fp, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(c)
            rel.append(os.path.join("src", p))
        last = ""
        for release in ("17", "11", "8"):                            # 브라우저의 자바(CheerpJ)가 읽을 수 있는 버전으로 컴파일 (서버 JDK 가 오래됐으면 낮춰서)
            argv = [javac, "-proc:none", "-nowarn", "--release", release, "-encoding", "UTF-8", "-d", "out"] + rel
            rc, so, se, _, timed_out, _ = await sb._run(argv, tmp, "", COMPILE_SECONDS, cpu=int(COMPILE_SECONDS))
            if timed_out:
                return {"ok": False, "errors": "컴파일 시간이 너무 오래 걸려서 중단했어요."}
            last = (se or so or "").strip()
            if rc == 0:
                break
            if "release version" in last and "not supported" in last:
                continue
            return {"ok": False, "errors": last.replace(os.path.join(tmp, "src") + os.sep, "").replace("src" + os.sep, "")}
        else:
            return {"ok": False, "errors": last}
        classes: Dict[str, bytes] = {}
        for root, _, names in os.walk(out):
            for n in names:
                if n.endswith(".class"):
                    fp = os.path.join(root, n)
                    classes[os.path.relpath(fp, out).replace(os.sep, "/")] = open(fp, "rb").read()
        if not classes:
            return {"ok": False, "errors": "컴파일 결과가 없어요."}
        if main_class.replace(".", "/") + ".class" not in classes:
            raise GuiBuildError(f"실행할 클래스 '{main_class}' 를 컴파일 결과에서 찾지 못했어요. 파일 이름·클래스 이름·package 를 확인해 주세요.")
        problems = check_classes(classes)
        if problems:
            raise GuiBuildError("이 프로그램은 브라우저 GUI 창에서 쓸 수 없는 기능을 써요:\n  · " + "\n  · ".join(problems[:6]))
        jar = make_jar(classes)
        if len(jar) > MAX_JAR_BYTES:
            raise GuiBuildError("컴파일 결과가 너무 커요.")
        return {"ok": True, "jar": jar, "main": main_class, "classes": len(classes)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
