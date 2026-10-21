"""자바 GUI 창(브라우저 CheerpJ) 준비 테스트 — 임시 DB·임시 포트(8095)로 서버를 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_gui_build.py (프로젝트 루트에서)
확인: ① 로그인 필요 ② Swing 코드가 컴파일되어 jar 로 온다 ③ 컴파일 오류는 읽을 수 있게 ④ 위험한 기능(이름으로 클래스 불러오기·리플렉션·JS 연결·native)과 이상한 경로는 막는다 ⑤ 여러 파일·package"""
import base64, io, json, os, sqlite3, subprocess, sys, time, datetime, urllib.request, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_gui_build.db"); PORT = 8095
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
from services import java_gui
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"),
                       env=dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
c.execute("insert into users (id,email,hashed_password,username,oauth_provider,is_active,created_at) values (1,'a@example.com','','u1','google',1,?)", (now,)); c.commit()
TOK = create_access_token({"sub": "1", "email": "a@example.com"})
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
def post(path, body, tok=TOK):
    h = {"Content-Type": "application/json"}
    if tok: h["Authorization"] = "Bearer " + tok
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method="POST", data=json.dumps(body).encode(), headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, (json.loads(e.read() or b"{}") if e.fp else {})
def build(files, main): return post("/api/gui/java/build", {"files": [{"path": p, "content": s} for p, s in files], "main_class": main})
SWING = '''import javax.swing.*;
import java.awt.*;
public class main {
    public static void main(String[] args) {
        JFrame frame = new JFrame("버튼 20개");
        frame.setSize(500, 400);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        JPanel panel = new JPanel(new GridLayout(5, 4, 10, 10));
        for (int i = 1; i <= 20; i++) { JButton b = new JButton("버튼 " + i); int n = i; b.addActionListener(e -> System.out.println("버튼 " + n + " 클릭!")); panel.add(b); }
        frame.add(panel); frame.setVisible(true);
    }
}
'''
try:
    st, r = post("/api/gui/java/build", {"files": [{"path": "main.java", "content": SWING}], "main_class": "main"}, tok=None)
    chk("로그인 없이는 거절 (401)", st == 401, st)
    st, cfg = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/gui/config").status, json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/gui/config").read())
    chk("설정: 사용 가능 여부와 프레임 주소(기본 비어 있음)를 알려 준다", cfg.get("available") is True and cfg.get("frame_origin") == "", cfg)
    st, r = build([("main.java", SWING)], "main")
    ok = st == 200 and r.get("ok") is True
    chk("사용자의 Swing 예제(버튼 20개)가 컴파일돼서 jar 로 온다", ok and r["main"] == "main", (st, str(r)[:200]))
    if ok:
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(r["jar_b64"])))
        names = z.namelist(); chk("  ㄴ jar 안에 main.class 가 있다 (람다 클래스 포함 가능)", "main.class" in names, names)
        major = z.read("main.class")[7]
        chk("  ㄴ 브라우저의 자바(17)가 읽을 수 있는 버전으로 컴파일된다 (class major ≤ 61)", major <= 61, major)
        strings, native = java_gui.parse_class(z.read("main.class"))
        chk("  ㄴ 클래스 파일 해석기가 상수 풀을 읽는다 (javax/swing 이 보임, native 없음)", any("javax/swing/JFrame" == s for s in strings) and native is False, strings[:6])
    st, r = build([("main.java", SWING.replace("frame.setVisible(true);", "frame.setVisible(true)"))], "main")
    chk("컴파일 오류는 ok:false 와 읽을 수 있는 메시지로 온다 (서버 경로가 새지 않는다)", st == 200 and r.get("ok") is False and "main.java" in r["errors"] and "expected" in r["errors"] and "gui_build_" not in r["errors"], r)
    st, r = build([("main.java", SWING)], "Nope")
    chk("없는 main 클래스 이름은 이유를 알려 준다", r.get("ok") is False and "찾지 못했어요" in r.get("errors", ""), r)
    st, r = build([("main.java", SWING)], "bad name;rm")
    chk("main 클래스 이름 형식이 이상하면 거절", r.get("ok") is False, r)
    # 위험한 기능은 막는다
    bad = {
        "Class.forName": 'public class Evil { public static void main(String[] a) throws Exception { Class.forName("netscape.javascript.JSObject"); } }',
        "JS 연결(JSObject)": 'public class Evil { public static void main(String[] a) { Object o = netscape.javascript.JSObject.class; } }',
        "리플렉션": 'public class Evil { public static void main(String[] a) throws Exception { java.lang.reflect.Method m = String.class.getMethod("length"); } }',
        "native": 'public class Evil { static native void leak(); public static void main(String[] a) { } }',
        "클래스 로더": 'public class Evil { public static void main(String[] a) throws Exception { ClassLoader.getSystemClassLoader().loadClass("x"); } }',
    }
    for label, src in bad.items():
        st, r = build([("Evil.java", src)], "Evil")
        chk(f"위험한 기능({label})을 쓰는 프로그램은 막는다", r.get("ok") is False and ("쓸 수 없어요" in r.get("errors", "") or "native" in r.get("errors", "")) and "jar_b64" not in r, str(r)[:160])
    for badpath in ("../evil.java", "/etc/x.java", "a/../../b.java", "x.txt", "a;b.java"):
        st, r = build([(badpath, "class X{}")], "X")
        chk(f"이상한 파일 경로({badpath})는 거절", r.get("ok") is False, r)
    st, r = build([("a.java", "class X{}")] * 61, "X")
    chk("파일이 너무 많으면 거절", st == 422 or r.get("ok") is False, (st, r))
    # 여러 파일 + package
    st, r = build([("app/Main.java", 'package app;\nimport javax.swing.*;\npublic class Main { public static void main(String[] a){ new Panel2().show(); } }'), ("app/Panel2.java", 'package app;\nimport javax.swing.*;\nclass Panel2 { void show(){ JFrame f = new JFrame("x"); f.setSize(100,100); f.setVisible(true); } }')], "app.Main")
    chk("여러 파일·package 가 있는 프로젝트도 컴파일된다 (실행 클래스는 app.Main)", r.get("ok") is True and r.get("main") == "app.Main" and r.get("classes", 0) >= 2, str(r)[:160])
    # 한글 파일·클래스 이름
    st, r = build([("한글.java", 'public class 한글 { public static void main(String[] a){ } }')], "한글")
    chk("한글 파일·클래스 이름도 컴파일된다", r.get("ok") is True, str(r)[:160])
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
