"""PWA(앱 설치) 아이콘을 브랜드 로고(docs/brand/mark-full.png)로 한 번에 만든다.  실행:  .venv/bin/python scripts/make_pwa_icons.py
(개발용 도구라서 Pillow 가 필요하다: .venv/bin/pip install pillow — 서버 requirements 에는 넣지 않는다)

만드는 것 → frontend/icons/  (서버가 /static/icons/ 로 내려준다)
  icon-{light,dark}-{48..512}.png       'any' 용: 정사각형 꽉 찬 배경 + 로고 (Windows·macOS·크롬 앱 목록·바로가기)
  maskable-{light,dark}-{192,512}.png   안드로이드 적응형 아이콘용: 로고를 가운데 안전 영역(지름 80% 원) 안에 작게
  monochrome-{192,512}.png              안드로이드 13+ '테마 아이콘'용: 한 색 실루엣(시스템이 색을 입힌다)
  apple-touch-{light,dark}.png          iOS '홈 화면에 추가'용 180px (iOS 는 투명 배경을 검게 채우므로 꽉 찬 배경)
  favicon-{light,dark}-{32,64}.png      브라우저 탭용: 둥근 타일 + 로고

라이트 = 흰 배경, 다크 = 브랜드 다크 배경(#0B1020, docs/brand/icon-dark-180.png 와 같은 색).
원본 로고가 231x251px 라서 512px 아이콘은 약간 키워서 만든다(부드러운 확대 + 가장자리 선명화). 벡터(SVG) 로고가 생기면 이 스크립트의 SRC 만 바꾸면 된다.
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "brand", "mark-full.png")
OUT = os.path.join(ROOT, "frontend", "icons")
BG = {"light": (255, 255, 255, 255), "dark": (11, 16, 32, 255)}
os.makedirs(OUT, exist_ok=True)

mark = Image.open(SRC).convert("RGBA")
mark = mark.crop(mark.getchannel("A").getbbox())          # 투명 여백을 잘라 로고 영역만


def scaled_mark(height: int) -> Image.Image:
    """로고를 height px 높이로. 크게 키울 때 흐려지지 않게: 부드럽게 확대 → 가장자리(알파)만 또렷하게 → 살짝 선명화"""
    w = round(mark.width * height / mark.height)
    big = mark.resize((w, height), Image.LANCZOS)
    a = big.getchannel("A").point(lambda v: 0 if v < 24 else (255 if v > 232 else int((v - 24) * 255 / 208)))   # 가장자리 대비를 높여 번짐 줄이기
    rgb = big.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=2))
    out = rgb.convert("RGBA"); out.putalpha(a)
    return out


def tile(size: int, theme: str, ratio: float, radius: float = 0.0) -> Image.Image:
    """size x size 정사각형 타일. ratio = 로고 높이 / 타일 높이. radius > 0 이면 둥근 모서리(바깥은 투명)"""
    canvas = Image.new("RGBA", (size, size), BG[theme])
    m = scaled_mark(round(size * ratio))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    if radius > 0:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=round(size * 4 * radius), fill=255)
        canvas.putalpha(mask.resize((size, size), Image.LANCZOS))
    return canvas


def save(img: Image.Image, name: str) -> None:
    img.save(os.path.join(OUT, name), optimize=True)
    print("  ", name, img.size)


for theme in ("light", "dark"):
    for s in (48, 72, 96, 128, 144, 152, 192, 256, 384, 512):
        save(tile(s, theme, 0.62), f"icon-{theme}-{s}.png")                 # any
    for s in (192, 512):
        save(tile(s, theme, 0.52), f"maskable-{theme}-{s}.png")             # maskable: 안전 영역(지름 80% 원) 안에 들어가는 크기
    save(tile(180, theme, 0.62), f"apple-touch-{theme}.png")                # iOS
    for s in (32, 64):
        save(tile(s, theme, 0.66, radius=0.22), f"favicon-{theme}-{s}.png")  # 탭 아이콘(둥근 타일)

for s in (192, 512):                                                        # 한 색 실루엣 (색은 시스템이 입힌다)
    h = round(s * 0.52)
    m = scaled_mark(h)
    sil = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    solid = Image.new("RGBA", m.size, (0, 0, 0, 255)); solid.putalpha(m.getchannel("A"))
    sil.alpha_composite(solid, ((s - m.width) // 2, (s - m.height) // 2))
    save(sil, f"monochrome-{s}.png")
print("완료:", OUT)
