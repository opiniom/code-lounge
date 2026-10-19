"""코드 실행 샌드박스 단독 테스트 (서버 필요 없음). 실행: .venv/bin/python tests/test_sandbox_runner.py (프로젝트 루트에서)
이 컴퓨터에 설치된 언어만 검사하고, 없는 언어는 '미설치 안내'가 정직하게 나오는지 확인한다."""
import asyncio, json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api"))
_cfg = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)          # 이 테스트는 엔진 자체를 검사하므로 모든 언어를 '공개'로 켠다 (공개 여부는 별도 테스트)
json.dump({"enabled": {k: True for k in ("python", "javascript", "typescript", "java", "c", "cpp", "csharp", "ruby", "php", "perl", "bash", "go", "rust")}}, _cfg); _cfg.close()
os.environ["LANGS_CONFIG"] = _cfg.name
from services.sandbox_runner import local_sandbox_runner as r, available, LABELS
AV = available(); R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
async def run(lang, code, stdin="", t=2.0): return await r.execute(code, lang, stdin, t)
async def main():
    chk("지원 목록은 설치된 도구 기준", set(r.get_supported_languages()) == {k for k, v in AV.items() if v})
    d = await run("python", "print(input()+'!')", "abc\n"); chk("Python + stdin", d.status == "Accepted" and d.stdout.strip() == "abc!", d)
    d = await run("python", "raise ValueError('x')"); chk("Python 오류는 Runtime Error + stderr", d.status == "Runtime Error" and "ValueError" in (d.stderr or ""))
    d = await run("python", "while True: pass", t=1.0); chk("무한 반복은 시간 제한", d.status == "Time Limit Exceeded", d.status)
    d = await run("python", "import os\nprint([k for k in os.environ if any(w in k for w in ('KEY','SECRET','TOKEN','PASSWORD','DATABASE','JWT'))])")
    chk("서버 환경변수(비밀)는 실행 코드에 전달되지 않음", d.stdout.strip() == "[]", d.stdout)
    d = await run("python", "while True: print('y'*1000)", t=1.0); chk("무한 출력도 안전하게 중단", d.status == "Time Limit Exceeded" and len(d.stdout or "") < 300_000)
    d = await run("cobol", "x"); chk("모르는 언어는 지원 목록과 함께 안내", d.status == "Error" and "지원하지 않는 언어" in (d.error or ""))
    d = await run("python", "x" * 250_000); chk("너무 긴 코드 거부", d.status == "Error")
    if AV["javascript"]:
        d = await run("javascript", "console.log(1+1)"); chk("JavaScript", d.status == "Accepted" and d.stdout.strip() == "2", d)
        d = await run("js", "console.log(3)"); chk("별칭 js", d.stdout and d.stdout.strip() == "3")
    if AV["typescript"]:
        d = await run("typescript", "const a: number = 3; console.log(a*2)"); chk("TypeScript", d.status == "Accepted" and d.stdout.strip() == "6", d)
    for lang, code, want in (("ruby", "puts 'rb'", "rb"), ("perl", 'print "pl\\n"', "pl"), ("bash", "echo sh", "sh"), ("php", "<?php echo 'ph';", "ph")):
        if AV[lang]:
            d = await run(lang, code); chk(LABELS[lang], d.status == "Accepted" and d.stdout.strip() == want, d)
    if AV["java"]:
        for label, code, want in (
            ("Java: Main", "public class Main { public static void main(String[] a){ System.out.println(\"J1\"); } }", "J1"),
            ("Java: 클래스 이름이 Main 이 아니어도 실행(예전엔 컴파일 에러)", "public class Hello { public static void main(String[] a){ System.out.println(\"J2\"); } }", "J2"),
            ("Java: public 없는 클래스(예전엔 Runtime Error)", "class Foo { public static void main(String[] a){ System.out.println(\"J3\"); } }", "J3"),
            ("Java: package 선언", "package demo;\npublic class App { public static void main(String[] a){ System.out.println(\"J4\"); } }", "J4"),
            ("Java: 보조 클래스와 함께", "class Helper { static String s(){ return \"J5\"; } }\npublic class Run { public static void main(String[] a){ System.out.println(Helper.s()); } }", "J5")):
            d = await run("java", code); chk(label, d.status == "Accepted" and d.stdout.strip() == want, d)
        d = await run("java", "import java.util.*; public class Main { public static void main(String[] a){ Scanner s=new Scanner(System.in); System.out.println(s.nextInt()*2); } }", "21\n"); chk("Java stdin", d.stdout and d.stdout.strip() == "42", d)
        d = await run("java", "public class Main { void x( }"); chk("Java 컴파일 에러는 메시지와 함께", d.status == "Compilation Error" and d.compile_output)
    if AV["c"]:
        d = await run("c", '#include <stdio.h>\nint main(){int a;scanf("%d",&a);printf("%d\\n",a+1);return 0;}', "41\n"); chk("C + stdin", d.status == "Accepted" and d.stdout.strip() == "42", d)
        d = await run("c", "int main(){ nope(); }"); chk("C 컴파일 에러", d.status == "Compilation Error")
    if AV["cpp"]:
        d = await run("cpp", '#include <iostream>\nint main(){std::cout<<"cpp"<<std::endl;}'); chk("C++", d.status == "Accepted" and d.stdout.strip() == "cpp", d)
        d = await run("c++", '#include <iostream>\nint main(){std::cout<<"x";}'); chk("별칭 c++", d.stdout == "x")
    for lang in ("csharp", "go", "rust", "php"):
        if not AV[lang]:
            d = await run(lang, "x"); chk(f"{LABELS[lang]} 미설치면 가짜 결과 없이 솔직한 안내", d.status == "Error" and "설치돼 있지 않아요" in (d.error or "") and not d.stdout, d)
asyncio.run(main())
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과  (설치된 언어: {', '.join(r.get_supported_languages())})")
sys.exit(1 if bad else 0)
