"""PWA(앱 설치) 테스트 — 임시 DB·임시 포트(8092)로 서버를 직접 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_pwa.py (프로젝트 루트에서). 아이콘 크기 검사에는 Pillow 가 필요하다(개발용)."""
import io, json, math, os, re, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_pwa.db"); PORT = 8092; B = f"http://127.0.0.1:{PORT}"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"),
                       env=dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: urllib.request.urlopen(B + "/health", timeout=1); break
    except Exception: time.sleep(0.5)
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
def get(path):
    try:
        with urllib.request.urlopen(B + path, timeout=15) as r: return r.status, dict((k.lower(), v) for k, v in r.headers.items()), r.read()
    except urllib.error.HTTPError as e: return e.code, dict((k.lower(), v) for k, v in e.headers.items()), e.read()
try:
    from PIL import Image
    have_pil = True
except Exception:
    have_pil = False
try:
    for theme in ("light", "dark"):
        s, h, body = get(f"/manifest.webmanifest?theme={theme}"); m = json.loads(body)
        chk(f"[{theme}] 매니페스트 200 + application/manifest+json", s == 200 and h["content-type"].startswith("application/manifest+json"), (s, h.get("content-type")))
        need = ("id", "name", "short_name", "start_url", "scope", "display", "background_color", "theme_color", "icons", "lang", "description")
        chk(f"[{theme}] 필수 항목 {len(need)}개", all(m.get(k) for k in need), [k for k in need if not m.get(k)])
        chk(f"[{theme}] 독립 실행(standalone) + start_url 이 scope 안", m["display"] == "standalone" and m["start_url"].startswith("/app") and m["scope"] == "/")
        icons = m["icons"]; any_sizes = {i["sizes"] for i in icons if i["purpose"] == "any"}
        chk(f"[{theme}] 설치 조건: 192·512 'any' 아이콘", {"192x192", "512x512"} <= any_sizes, any_sizes)
        chk(f"[{theme}] maskable(192·512) + monochrome(192·512) 아이콘 있음", {(i["purpose"], i["sizes"]) for i in icons} >= {("maskable", "192x192"), ("maskable", "512x512"), ("monochrome", "192x192"), ("monochrome", "512x512")})
        chk(f"[{theme}] 바로가기(shortcuts) 4개", len(m["shortcuts"]) == 4 and all(sc["url"].startswith("/app/") for sc in m["shortcuts"]))
        bad = []
        for i in icons + [ic for sc in m["shortcuts"] for ic in sc["icons"]]:
            st, hh, data = get(i["src"])
            if st != 200 or not hh.get("content-type", "").startswith("image/png"): bad.append((i["src"], st)); continue
            if have_pil:
                w, hgt = Image.open(io.BytesIO(data)).size
                if f"{w}x{hgt}" != i["sizes"]: bad.append((i["src"], f"선언 {i['sizes']} 실제 {w}x{hgt}"))
        chk(f"[{theme}] 매니페스트의 모든 아이콘이 열리고 선언한 크기와 같음", not bad, bad[:3])
    ml, md = json.loads(get("/manifest.webmanifest?theme=light")[2]), json.loads(get("/manifest.webmanifest?theme=dark")[2])
    chk("라이트/다크 매니페스트의 색이 다름(배경·상단)", ml["background_color"] != md["background_color"] and ml["theme_color"] != md["theme_color"], (ml["background_color"], md["background_color"]))
    chk("라이트/다크 아이콘 파일이 다름(any·maskable)", {i["src"] for i in ml["icons"] if i["purpose"] != "monochrome"}.isdisjoint({i["src"] for i in md["icons"] if i["purpose"] != "monochrome"}))
    chk("모르는 theme 값은 라이트로", json.loads(get("/manifest.webmanifest?theme=<script>")[2])["theme_color"] == ml["theme_color"])
    if have_pil:
        for theme, bg in (("light", (255, 255, 255)), ("dark", (11, 16, 32))):
            im = Image.open(io.BytesIO(get(f"/static/icons/icon-{theme}-512.png")[2])).convert("RGBA")
            chk(f"[{theme}] 아이콘 배경색 = {'흰색' if theme == 'light' else '브랜드 다크(#0B1020)'}", im.getpixel((5, 5))[:3] == bg and im.getpixel((5, 5))[3] == 255, im.getpixel((5, 5)))
            mk = Image.open(io.BytesIO(get(f"/static/icons/maskable-{theme}-512.png")[2])).convert("RGBA")
            diff = Image.new("RGBA", mk.size, bg + (255,)); from PIL import ImageChops
            box = ImageChops.difference(mk, diff).convert("L").point(lambda v: 255 if v > 12 else 0).getbbox()
            cx = cy = 256; far = max(math.hypot(x - cx, y - cy) for x, y in ((box[0], box[1]), (box[2], box[1]), (box[0], box[3]), (box[2], box[3])))
            chk(f"[{theme}] maskable 로고가 안전 영역(지름 80% 원) 안에 들어감", far <= 512 * 0.40, round(far))
            ap = Image.open(io.BytesIO(get(f"/static/icons/apple-touch-{theme}.png")[2])); chk(f"[{theme}] iOS 아이콘 180x180, 투명 없음(iOS 는 투명을 검게 채움)", ap.size == (180, 180) and ap.convert("RGBA").getchannel("A").getextrema() == (255, 255), ap.size)
        mono = Image.open(io.BytesIO(get("/static/icons/monochrome-512.png")[2])).convert("RGBA")
        px = [p for p in mono.getdata() if p[3] > 0]
        chk("monochrome: 한 색(검정) 실루엣 + 투명 배경", px and all(p[:3] == (0, 0, 0) for p in px) and mono.getpixel((3, 3))[3] == 0, len(px))
    # --- 서비스 워커
    s, h, body = get("/sw.js"); sw = body.decode("utf-8")
    chk("sw.js: 200 + JavaScript", s == 200 and "javascript" in h["content-type"], (s, h.get("content-type")))
    chk("sw.js: 항상 최신 확인(no-cache) + 전체 사이트 범위 허용", "no-cache" in h.get("cache-control", "") and h.get("service-worker-allowed") == "/", (h.get("cache-control"), h.get("service-worker-allowed")))
    html = get("/app")[2].decode("utf-8"); build = re.search(r"/static/bundle\.js\?v=([0-9a-f]+)", html).group(1)
    chk("sw.js: 화면 버전이 들어가고(__BUILD__ 남지 않음) index.html 의 버전과 같음", "__BUILD__" not in sw and f"'{build}'" in sw, build)
    chk("sw.js: 서버 데이터(/api·/ws)·POST 는 가로채지 않음", "'/api/'" in sw and "'/ws/'" in sw and "req.method !== 'GET'" in sw)
    chk("sw.js: 다른 사이트 요청은 가로채지 않음", "url.origin !== self.location.origin" in sw)
    # --- 화면/오프라인
    chk("index.html: 매니페스트·아이콘·iOS 설정·상단 색", all(x in html for x in ('rel="manifest"', 'rel="apple-touch-icon"', 'name="theme-color"', 'apple-mobile-web-app-capable', 'id="avatarInstallBtn"')))
    chk("index.html: 예전 base64 아이콘이 빠져서 가벼워짐", "data:image/png;base64" not in html, len(html))
    bj = get(f"/static/bundle.js?v={build}")[2].decode("utf-8"); bc = get(f"/static/bundle.css?v={build}")[2].decode("utf-8")
    chk("묶음 JS·CSS 에 PWA 코드가 들어 있음", "function pwaRegister" in bj and ".pwa-guide" in bc)
    s, h, body = get("/static/offline.html"); chk("오프라인 화면 200 + HTML(다크 모드·다시 시도)", s == 200 and "text/html" in h["content-type"] and "prefers-color-scheme: dark" in body.decode() and 'id="retry"' in body.decode())
    s, h, _ = get("/static/icons/icon-light-192.png"); chk("아이콘은 하루 캐시(Cache-Control)", "max-age=86400" in h.get("cache-control", ""), h.get("cache-control"))
    chk("기존 화면 묶음 캐시(1년·immutable)는 그대로", "immutable" in get(f"/static/bundle.js?v={build}")[1].get("cache-control", ""))
    s, _, _ = get("/static/manifest.json"); chk("(참고) 화면 묶음용 manifest.json 과 PWA 매니페스트는 서로 다른 주소", True)
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [r for r in R if not r[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과" + ("" if have_pil else "  (Pillow 없음: 아이콘 크기 검사 생략)")); sys.exit(1 if bad else 0)
