"""브랜드 로고(두레 마크)를 높은 해상도로 만들어 두고, 화면 곳곳에서 쓰는 크기별 파일을 한 번에 다시 만든다.
실행:  python3 scripts/make_brand_assets.py   (개발용 도구라서 Pillow 가 필요하다 — 서버 requirements 에는 넣지 않는다)

왜 필요한가: 원본 로고(docs/brand/mark-full.png)가 231x251px 뿐이라, 화면에 크게(홈 가운데 로고, 소개 화면 등) 또는 고해상도(레티나) 화면에 쓰면 흐리고 픽셀이 보인다.
벡터(SVG) 원본이 없어서, 원본에서 가장자리를 부드럽게 4배로 키운 뒤 또렷하게 다듬은 '고해상도 마스터'(docs/brand/mark-hd.png)를 만들고,
쓰는 곳마다 그 마스터를 줄여서(줄이면 항상 또렷하다) 만든다. 나중에 벡터 로고가 생기면 이 파일의 SRC 와 master() 만 바꾸면 된다.

만드는 것
  docs/brand/mark-hd.png          마스터 (약 924x1004)
  docs/brand/mark-128.png · mark-56.png   화면 CSS 의 --mark-128 · --mark-56 에 넣는 크기별 이미지 (각각 288px · 120px 너비)
  frontend/icons/mark-hd.png      큰 로고(홈 가운데·소개 첫 화면)용 — 화면이 /static/icons/mark-hd.png 로 받는다
  frontend/css/base.css           --mark-56 · --mark-128 의 이미지를 새 것으로 바꿔 넣는다
앱 아이콘(frontend/icons/*)은 이어서 scripts/make_pwa_icons.py 가 이 마스터로 다시 만든다.
"""
import base64, io, os, re, warnings
from PIL import Image, ImageChops, ImageFilter, ImageMath

warnings.filterwarnings("ignore", category=DeprecationWarning)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "brand", "mark-full.png")
BRAND = os.path.join(ROOT, "docs", "brand")
ICONS = os.path.join(ROOT, "frontend", "icons")
BASE_CSS = os.path.join(ROOT, "frontend", "css", "base.css")
SCALE = 4


def resize_rgba(img: Image.Image, size) -> Image.Image:
    """투명한 가장자리에 색이 번지지 않게(흰 테두리 방지) 알파를 곱한 채로 크기를 바꾼 뒤 되돌린다"""
    r, g, b, a = img.split()
    A = a.resize(size, Image.LANCZOS)
    chans = []
    for c in (r, g, b):
        p = ImageChops.multiply(c, a).resize(size, Image.LANCZOS)
        chans.append(ImageMath.unsafe_eval("convert(min(p * 255 / (a + 1), 255), 'L')", p=p, a=A))
    return Image.merge("RGBA", (*chans, A))


def extend_colors(src: Image.Image) -> Image.Image:
    """가장자리 색 번짐(밝은 테두리) 없애기: 가장자리에서 2px 안쪽의 색만 믿고, 그 색을 바깥으로 부드럽게 이어 붙인다"""
    a = src.getchannel("A")
    w = a.point(lambda v: 255 if v > 250 else 0).filter(ImageFilter.MinFilter(5))          # 확실히 안쪽인 곳만
    out = []
    for c in src.convert("RGB").split():
        cw = ImageChops.multiply(c, w).filter(ImageFilter.GaussianBlur(3))
        wb = w.filter(ImageFilter.GaussianBlur(3))
        out.append(ImageMath.unsafe_eval("convert(min(p * 255 / (b + 1), 255), 'L')", p=cw, b=wb))
    near = ImageMath.unsafe_eval("convert(min(b * 4, 255), 'L')", b=w.filter(ImageFilter.GaussianBlur(3)))
    inner = src.convert("RGB").split()
    # 안쪽(확실한 곳)은 원래 색 그대로, 가장자리·바깥은 이어 붙인 색
    mixed = [Image.composite(i, e, w.filter(ImageFilter.GaussianBlur(1))) for i, e in zip(inner, out)]
    return Image.merge("RGB", mixed)



def contours(alpha: Image.Image, level: int = 128):
    """알파에서 level 경계선을 '소수점 단위 위치'로 따라간다(marching squares). 닫힌 윤곽선 목록을 돌려준다.
    안쪽(>= level)이 항상 선분의 같은 쪽에 오도록 방향을 맞춰 두고, 끝점과 시작점을 짝지어 이어 붙인다."""
    w, h = alpha.size
    px = list(alpha.getdata())
    v = lambda x, y: px[y * w + x]
    cache = {}

    def pt(kind, x, y):
        key = (kind, x, y)
        r = cache.get(key)
        if r is None:
            if kind == "h":
                a, b = v(x, y), v(x + 1, y); t = (level - a) / (b - a) if b != a else .5; r = (x + t, float(y))
            else:
                a, b = v(x, y), v(x, y + 1); t = (level - a) / (b - a) if b != a else .5; r = (float(x), y + t)
            cache[key] = r
        return r
    nxt = {}
    for y in range(h - 1):
        for x in range(w - 1):
            tl, tr, br, bl = v(x, y) >= level, v(x + 1, y) >= level, v(x + 1, y + 1) >= level, v(x, y + 1) >= level
            c = (tl << 3) | (tr << 2) | (br << 1) | bl
            if c in (0, 15): continue
            T, R, B, L = ("h", x, y), ("v", x + 1, y), ("h", x, y + 1), ("v", x, y)
            # 안쪽이 진행 방향의 오른쪽에 오도록 (화면 좌표계 기준) 시계 방향으로 도는 선분들
            tbl = {1: [(B, L)], 2: [(R, B)], 3: [(R, L)], 4: [(T, R)], 5: [(T, R), (B, L)], 6: [(T, B)], 7: [(T, L)],
                   8: [(L, T)], 9: [(B, T)], 10: [(L, T), (R, B)], 11: [(R, T)], 12: [(L, R)], 13: [(B, R)], 14: [(L, B)]}
            for a_, b_ in tbl[c]:
                nxt[a_] = b_
    loops, seen = [], set()
    for start in list(nxt):
        if start in seen: continue
        loop, cur = [], start
        while cur in nxt and cur not in seen:
            seen.add(cur); loop.append(pt(*cur)); cur = nxt[cur]
        if cur == start and len(loop) > 20: loops.append(loop)
    return loops


def smooth_loop(pts, win: int, passes: int = 2):
    """닫힌 윤곽선의 잔 굴곡(원본의 계단·압축 잡티)을 이동 평균으로 펴서 매끈한 곡선으로 만든다"""
    n = len(pts)
    for _ in range(passes):
        out = []
        for i in range(n):
            sx = sy = 0.0
            for k in range(-win, win + 1):
                x, y = pts[(i + k) % n]; sx += x; sy += y
            out.append((sx / (2 * win + 1), sy / (2 * win + 1)))
        pts = out
    return pts


def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2


def smooth_alpha(src_alpha: Image.Image, size) -> Image.Image:
    """원본 알파의 경계선을 따라가 곡선으로 다듬은 뒤, 그 곡선으로 또렷한 가장자리(안티앨리어싱)를 다시 그린다"""
    up = src_alpha.resize(size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(SCALE * 0.35))
    loops = contours(up)
    ss = 2                                                       # 2배로 그려서 줄이면 가장자리가 부드럽게 칠해진다
    mask = Image.new("L", (size[0] * ss, size[1] * ss), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(mask)
    big = max((abs(area(l)) for l in loops), default=1)
    ref = 1 if any(area(l) > 0 for l in loops if abs(area(l)) == big) else -1
    for l in sorted(loops, key=lambda l: -abs(area(l))):
        sm = smooth_loop(l, win=round(SCALE * 4.5), passes=3)
        d.polygon([(x * ss, y * ss) for x, y in sm], fill=255 if (area(l) > 0) == (ref > 0) else 0)       # 바깥 윤곽은 채우고, 구멍은 비운다
    return mask.resize(size, Image.LANCZOS)


def master() -> Image.Image:
    src = Image.open(SRC).convert("RGBA")
    src = src.crop(src.getchannel("A").getbbox())
    size = (src.width * SCALE, src.height * SCALE)
    rgb = extend_colors(src).resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8)).filter(ImageFilter.UnsharpMask(radius=2.2, percent=60, threshold=2))   # 압축 잡티는 줄이고 색 경계는 살린다
    # 가장자리(알파): 경계선을 곡선으로 다듬어 다시 그린다 → 키워도 계단·번짐 없이 매끈하다
    a = smooth_alpha(src.getchannel("A"), size)
    out = rgb.convert("RGBA"); out.putalpha(a)
    pad = 3 * SCALE                                           # 가장자리가 잘리지 않게 약간의 투명 여백
    canvas = Image.new("RGBA", (out.width + pad * 2, out.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(out, (pad, pad))
    return canvas


def to_width(m: Image.Image, w: int) -> Image.Image:
    return resize_rgba(m, (w, round(m.height * w / m.width)))


def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO(); img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    m = master()
    m.save(os.path.join(BRAND, "mark-hd.png"), optimize=True); print("mark-hd", m.size)
    hd = to_width(m, 720); hd.save(os.path.join(ICONS, "mark-hd.png"), optimize=True); print("icons/mark-hd", hd.size)
    m128, m56 = to_width(m, 288), to_width(m, 120)
    m128.save(os.path.join(BRAND, "mark-128.png"), optimize=True); m56.save(os.path.join(BRAND, "mark-56.png"), optimize=True)
    print("mark-128", m128.size, "mark-56", m56.size)
    css = open(BASE_CSS, encoding="utf-8").read()
    for name, img in (("--mark-56", m56), ("--mark-128", m128)):
        css, n = re.subn(re.escape(name) + r":url\(data:image/png;base64,[A-Za-z0-9+/=]+\)", lambda _: f"{name}:url({data_uri(img)})", css, count=1)
        print(name, "교체" if n else "못 찾음")
    open(BASE_CSS, "w", encoding="utf-8").write(css)
