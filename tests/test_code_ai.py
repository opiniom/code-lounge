"""AI 에러 설명의 '규칙 기반' 부분 테스트 (AI 키 없이 서버 없이 실행). 실제 파이썬·노드·자바를 돌려서 나온 진짜 에러 글로 확인한다.
특히 '에러가 보고된 줄 ≠ 진짜 원인 줄' 인 경우(괄호를 안 닫음 → 몇 줄 뒤에서 에러)를 확인한다.
실행: .venv/bin/python tests/test_code_ai.py (프로젝트 루트에서)"""
import asyncio, os, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
os.environ["GEMINI_API_KEY"] = ""; os.environ["ANTHROPIC_API_KEY"] = ""
from config import settings
settings.GEMINI_API_KEY = ""; settings.ANTHROPIC_API_KEY = ""
from services import code_ai
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))

def run(argv, cwd):
    p = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=30)
    return (p.stderr or "") + (p.stdout if p.returncode else "")

def py_err(code):
    d = tempfile.mkdtemp()
    open(os.path.join(d, "main.py"), "w").write(code)
    try: return run([sys.executable, "-u", "-B", "main.py"], d)
    finally: shutil.rmtree(d, ignore_errors=True)

def ex(lang, code, err, fname=""):
    return asyncio.run(code_ai.explain(lang, code, err, fname))

# 1) 사용자가 말한 상황: 11번 줄에서 괄호를 안 닫았는데 에러는 한참 뒤에 난다
code = "\n".join(["# 점수 계산", "scores = [80, 90, 70]", "total = 0", "for s in scores:", "    total += s", "", "avg = total / len(scores)", "", "def show(name, value):", "    print(name, value)", "show(\"평균\", round(avg, 1)", "", "print(\"끝\")", "x = 10", "print(x)"]) + "\n"
err = py_err(code)
r = ex("python", code, err, "main.py")
chk("실제 에러 글에서 에러 줄을 찾음", r["error_line"] is not None, err)
chk("진짜 원인 줄 = 괄호를 연 11번 줄", r["cause_line"] == 11, (r["error_line"], r["cause_line"], err))
chk("에러 줄과 원인 줄이 다르면 설명 문장이 나온다", (r["error_line"] == r["cause_line"]) or ("11번 줄" in r["line_note"]), r["line_note"])
chk("쉬운 한국어 요약/순서가 있다", r["summary"] and r["steps"], r)
chk("AI 없이도 engine=rules", r["engine"] == "rules")

# 2) 파이썬 흔한 에러
cases = {
    "NameError(철자)": ("total = 10\nprint(totl)\n", "totl", 2, "totl"),
    "IndexError": ("a = [1, 2, 3]\nprint(a[3])\n", "리스트", 2, None),
    "ZeroDivisionError": ("x = 5\ny = 0\nprint(x / y)\n", "0으로", 3, None),
    "TypeError(str+int)": ("age = 20\nprint('나이: ' + age)\n", "str", 2, None),
    "IndentationError": ("for i in range(3):\nprint(i)\n", "들여쓰기", 2, None),
    "KeyError": ("d = {'a': 1}\nprint(d['b'])\n", "키", 2, None),
    "ValueError": ("n = int('abc')\n", "숫자", 1, None),
    "ModuleNotFound": ("import nonexistentlib\n", "라이브러리", 1, None),
}
for name, (c, word, line, extra) in cases.items():
    e = py_err(c); r = ex("python", c, e, "main.py")
    ok = r["known"] and r["error_line"] == line and word in (r["summary"] + r["explanation"] + " ".join(r["steps"]))
    if extra: ok = ok and ("totl" in r["summary"])
    chk("py " + name, ok, (r["summary"], r["error_line"], e[-120:]))
c = "total = 10\nprint(totl)\n"; r = ex("python", c, py_err(c), "main.py")
chk("NameError: 비슷한 이름('total')을 알려 준다", "total" in r["explanation"], r["explanation"])
c = "if True:\n    x = (1 +\n    y = 2\nprint(x)\n"; e = py_err(c); r = ex("python", c, e, "main.py")
chk("여는 괄호 줄(2번)이 원인으로 잡힘", r["cause_line"] == 2, (r["error_line"], r["cause_line"], e))

# 3) 노드
node = shutil.which("node")
if node:
    d = tempfile.mkdtemp()
    def js(code):
        open(os.path.join(d, "main.js"), "w").write(code); return run([node, "main.js"], d)
    c = "const a = 1;\nconsole.log(b);\n"; e = js(c); r = ex("javascript", c, e, "main.js")
    chk("js ReferenceError + 줄 번호", r["known"] and r["error_line"] == 2 and "b" in r["summary"], (r["summary"], r["error_line"], e[:150]))
    c = "let u;\nconsole.log(u.name);\n"; e = js(c); r = ex("javascript", c, e, "main.js")
    chk("js undefined 속성 읽기", r["known"] and r["error_line"] == 2 and "undefined" in r["summary"], (r["summary"], r["error_line"], e[:200]))
    c = "function f() {\n  console.log('a');\n\nf();\n"; e = js(c); r = ex("javascript", c, e, "main.js")
    chk("js 문법 오류: 원인 줄이 열린 중괄호(1번)", r["known"] and r["cause_line"] == 1, (r["error_line"], r["cause_line"], e[:200]))
    shutil.rmtree(d, ignore_errors=True)

# 4) 자바
javac = shutil.which("javac")
if javac:
    d = tempfile.mkdtemp()
    def jv(code):
        open(os.path.join(d, "Main.java"), "w").write(code); return run([javac, "-encoding", "UTF-8", "Main.java"], d)
    c = "public class Main {\n  public static void main(String[] a) {\n    int x = 5\n    System.out.println(x);\n  }\n}\n"; e = jv(c); r = ex("java", c, e, "Main.java")
    chk("java ; 빠짐", r["known"] and r["error_line"] == 3 and "세미콜론" in r["summary"], (r["summary"], r["error_line"], e[:150]))
    c = "public class Main {\n  public static void main(String[] a) {\n    System.out.println(y);\n  }\n}\n"; e = jv(c); r = ex("java", c, e, "Main.java")
    chk("java cannot find symbol", r["known"] and r["error_line"] == 3 and "y" in r["summary"], (r["summary"], r["error_line"], e[:200]))
    c = "public class Main {\n  public static void main(String[] a) {\n    System.out.println(1);\n  }\n"; e = jv(c); r = ex("java", c, e, "Main.java")
    chk("java 중괄호 짝 안 맞음 → 원인은 여는 중괄호 줄", r["known"] and r["cause_line"] in (1, 2), (r["error_line"], r["cause_line"], e[:200]))
    shutil.rmtree(d, ignore_errors=True)

# 4-2) 컴파일 에러가 여러 개일 때는 첫 번째 에러를 설명한다
if javac:
    d = tempfile.mkdtemp()
    code = 'public class Main {\n    public static void main(String[] args) {\n        int number = "100";\n        int r = 10 / 0;\n        System.out.println(total);\n    }\n}\n'
    open(os.path.join(d, "Main.java"), "w").write(code); e = run([javac, "-encoding", "UTF-8", "Main.java"], d)
    r = ex("java", code, e, "Main.java")
    chk("java 여러 컴파일 에러: 첫 에러(자료형 불일치, 3번 줄)를 설명", r["error_line"] == 3 and "종류" in r["summary"] + r["explanation"] and "total" not in r["summary"], (r["summary"], r["error_line"]))
    chk("java 여러 컴파일 에러: 개수 안내", "2개" in r["line_note"], r["line_note"])
    shutil.rmtree(d, ignore_errors=True)

# 5) 모르는 에러도 죽지 않고 안내
r = ex("go", "package main\n", "weird thing happened at the end", "main.go")
chk("모르는 에러도 일반 안내가 나온다", r["summary"] and r["steps"] and not r["known"], r)
r = ex("python", "print(1)\n", "x" * 50000, "main.py")
chk("아주 긴 에러 글도 처리", r["summary"])
r = ex("python", "print(1)\n", "Traceback...\nNameError: name 'zz' is not defined\n", "")
chk("줄 번호가 없는 에러 글도 처리", r["summary"] and r["error_line"] is None)

bad = [x for x in R if not x[1]]
for n, ok, extra in R: print(("PASS " if ok else "FAIL ") + n + ("" if ok else f"   ← {str(extra)[:300]}"))
print(f"\n{len(R) - len(bad)}/{len(R)} 통과")
sys.exit(1 if bad else 0)
