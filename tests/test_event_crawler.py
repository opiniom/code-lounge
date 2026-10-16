"""이벤트 수집 파서 테스트 (네트워크 없이). 실행: .venv/bin/python tests/test_event_crawler.py"""
import os, sys
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from services import event_crawler as ec

DEV = """
## 시선집중 👀
- __[무시되는 항목](https://example.com/ignored)__
  - 분류: `온라인`, `대회`
  - 주최: 무시
## `26년 10월`
- __[Replit x OpenAI Hackathon](https://partiful.com/e/abc?utm_source=x)__
  - 분류: `오프라인(서울)`, `무료`, `대회`, `AI`
  - 주최: Replit / OpenAI
  - 일시: 10. 14(수) 13:00 ~ 10. 14(수) 19:00
- __[[Nota on AIr #02] AI PC에서 로컬 LLM](https://www.kr.nota.ai/ytlive)__
  - 분류: `온라인`, `무료`, `세미나`, `AI`
  - 주최: 노타
  - 접수: 09. 28(월) 15:30 ~ 10. 14(수) 19:30
## `26년 1월`
- __[연말연시 해커톤](https://example.com/ny)__
  - 분류: `온라인`, `무료`, `대회`
  - 주최: 누구
  - 접수: 12. 20(토) ~ 01. 05(월)
  - 일시: 01. 10(토) 10:00 ~ 01. 11(일) 18:00
## 지난 행사 기록
- __[지난 것](https://example.com/old)__
  - 분류: `온라인`
  - 주최: 옛날
"""

WEV = """
<ul class="list"><li class="top"><div class="tit">공모전명</div></li>
<li ><div class="tit"> <a href="?c=find&s=1&gub=1&gbn=view&gp=1&ix=111">2026 AI 해커톤 <span class='stat spec'>SPECIAL</span> </a>
<div class="sub-tit">분야 : 웹/모바일/IT, 과학/공학</div></div><div class="organ">과기부</div><div class="day"> D-9 <span class="dday ing">접수중</span></div><div class="read">1</div></li>
<li ><div class="tit"> <a href="?c=find&s=1&gub=1&gbn=view&gp=1&ix=222">슬로건 공모전</a>
<div class="sub-tit">분야 : 네이밍/슬로건, 기타</div></div><div class="organ">시청</div><div class="day"> D-3 <span class="dday ing">접수중</span></div></li>
<li ><div class="tit"> <a href="?c=find&s=1&gub=1&gbn=view&gp=1&ix=444">영상 공모전 <span>SPECIAL</span> <span>IDEA</span></a>
<div class="sub-tit">분야 : 영상/UCC/사진, 웹/모바일/IT</div></div><div class="organ">구청</div><div class="day"> D-5 <span class="dday ing">접수중</span></div></li>
<li ><div class="tit"> <a href="?c=find&s=1&gub=1&gbn=view&gp=1&ix=333">오픈소스 SW 개발 공모전</a>
<div class="sub-tit">분야 : 기획/아이디어</div></div><div class="organ">NIPA</div><div class="day"> 마감 <span class="dday end">마감</span></div></li>
</ul>
"""

FEED = """<?xml version="1.0"?><rss><channel><title>대회 소식</title>
<item><title>제3회 데이터 챌린지</title><link>https://example.com/a</link><description>&lt;p&gt;설명&lt;/p&gt;</description></item>
<item><title>링크 없음</title></item></channel></rss>"""

def test_devevent():
    r = ec.parse_devevent(DEV)
    assert [x["title"] for x in r] == ["Replit x OpenAI Hackathon", "[Nota on AIr #02] AI PC에서 로컬 LLM", "연말연시 해커톤"], r
    h, n, ny = r
    assert h["category"] == "해커톤" and h["deadline_date"] == date(2026, 10, 14) and h["host"] == "Replit / OpenAI"
    assert n["category"] == "세미나" and n["deadline_date"] == date(2026, 10, 14) and n["starts_on"] is None   # 접수만 있고 행사 일시는 없음
    # 1월 섹션에서 12월 접수 시작은 전년도, 마감은 올해
    assert ny["starts_on"] == date(2026, 1, 10) and ny["deadline_date"] == date(2026, 1, 5), ny
    assert "무료" in h["description"] and "오프라인(서울)" in h["tags"]

def test_wevity():
    r = ec.parse_wevity(WEV, today=date(2026, 10, 16))
    titles = [x["title"] for x in r]
    assert titles == ["2026 AI 해커톤"], titles      # 슬로건·영상(비IT)과 이미 마감된 것은 제외
    x = r[0]
    assert x["category"] == "해커톤" and x["deadline_date"] == date(2026, 10, 25) and x["host"] == "과기부"
    assert x["url"].startswith("https://www.wevity.com/?c=find") and "ix=111" in x["url"]

def test_wevity_labels():
    html = '<div class="tit"> <a href="?ix=9">2026 AI 해커톤 신규 <span>SPECIAL</span> <span>IDEA</span></a><div class="sub-tit">분야 : 웹/모바일/IT</div></div><div class="organ">x</div><div class="day"> D-2 </div>'
    assert ec.parse_wevity(html, date(2026, 10, 16), it_page=True)[0]["title"] == "2026 AI 해커톤"

CK = """<div class="list_style_2"> <ul> <li class="imminent"> <div class="title"> <a href="view.php?int_gbn=2&Txt_bcode=040210001&str_no=202610130045"> <span class="category">인턴 • 체험 • 탐방 • 봉사 • 동아리</span> <img src='/pub/img/board/ic_new.gif'> <span class="txt">[2026년 고양 문라이트 워크] 자원봉사자 모집</span> </a> </div> <ul class="host"> <li class="icon_1"><strong>주최</strong> . 일산서구청소년수련관</li> <li class="icon_2"><strong>대상</strong> . 대학생 , 일반인 </li> </ul> <div class="date"><div class="date-detail"> <span class="step-1"><em>접수</em> 10.10~10.28 </span> <span class="step-2"><em>활동</em> 10.31 </span> </div></div> <div class="d-day orange"> <span class="day">D-12</span> <span class="condition">접수중</span> </div> </li>
<li> <div class="title"> <a href="view.php?int_gbn=1&Txt_bcode=030910001&str_no=1"> <span class="category">음악•콩쿠르•댄스</span> <span class="txt">백년 포크가요제</span> </a> </div> <ul class="host"><li class="icon_1"><strong>주최</strong> . 에프</li></ul> <div class="d-day"><span class="day">D-21</span><span class="condition">접수중</span></div> </li>
<li> <div class="title"> <a href="view.php?int_gbn=1&Txt_bcode=031110001&str_no=2"> <span class="category">학문•과학•IT</span> <span class="txt">화이트햇 2026 국방 사이버보안 콘테스트</span> </a> </div> <ul class="host"><li class="icon_1"><strong>주최</strong> . 국방부</li></ul> <span class="step-1"><em>접수</em> 10.01~11.02</span> <div class="d-day"><span class="day">D-17</span><span class="condition">접수중</span></div> </li>
<li> <div class="title"> <a href="view.php?int_gbn=1&str_no=3"> <span class="category">학문•과학•IT</span> <span class="txt">끝난 IT 대회</span> </a> </div> <div class="d-day"><span class="condition">마감</span></div> </li>
</ul><!-- pagination -->"""

def test_contestkorea():
    today = date(2026, 10, 16)
    act = ec.parse_contestkorea(CK, 2, today)
    assert act[0]["category"] == "대외활동" and act[0]["deadline_date"] == date(2026, 10, 28) and act[0]["starts_on"] == date(2026, 10, 31), act[0]
    assert act[0]["host"] == "일산서구청소년수련관" and act[0]["url"].startswith("https://www.contestkorea.com/sub/view.php?int_gbn=2") and "봉사" in " ".join(act[0]["tags"])
    cont = ec.parse_contestkorea(CK, 1, today)
    assert [x["title"] for x in cont] == ["화이트햇 2026 국방 사이버보안 콘테스트"], [x["title"] for x in cont]   # 음악(비IT)·마감 제외
    assert cont[0]["category"] == "공모전" and cont[0]["deadline_date"] == date(2026, 11, 2)

def test_og_image():
    h = '<html><head><meta property="og:image" content="//cdn.example.com/p/poster.jpg?x=1&amp;y=2"><meta name="twitter:image" content="/t.png"></head>'
    assert ec.extract_og_image(h, "https://ex.com/e/1") == "https://cdn.example.com/p/poster.jpg?x=1&y=2"
    assert ec.extract_og_image('<meta content="http://ex.com/a/poster.png" property="og:image">', "https://ex.com/") == "https://ex.com/a/poster.png"   # 속성 순서 달라도, http → https
    assert ec.extract_og_image('<meta property="og:image" content="/images/main_img16.png">', "https://ex.com/") is None   # 사이트 공용 이미지
    assert ec.extract_og_image('<meta property="og:image" content="javascript:alert(1)">', "https://ex.com/") is None
    assert ec.extract_og_image('<meta property="og:image" content="data:image/png;base64,AAA">', "https://ex.com/") is None
    assert ec.extract_og_image("<html></html>", "https://ex.com/") is None
    assert ec.guess_category("OO 대학생 서포터즈 3기 모집", []) == "대외활동"

def test_feed():
    r = ec.parse_feed(FEED, "https://example.com/rss")
    assert len(r) == 1 and r[0]["category"] == "공모전" and r[0]["host"] == "대회 소식" and r[0]["description"] == "설명"
    try:
        ec.parse_feed('<!DOCTYPE x [<!ENTITY a "b">]><rss/>'); assert False
    except ValueError:
        pass

def test_misc():
    assert ec.canonical_url("https://A.com/p?id=1&utm_source=x#top") == "https://a.com/p?id=1"
    assert ec.make_key("devevent", "https://a.com/p?utm_source=x") == ec.make_key("devevent", "https://a.com/p")
    assert ec.make_key("devevent", "https://a.com/p") != ec.make_key("wevity", "https://a.com/p")
    assert ec.calc_dday(date(2026, 10, 20), date(2026, 10, 16)) == "D-4"
    assert ec.calc_dday(date(2026, 10, 16), date(2026, 10, 16)) == "D-Day"
    assert ec.calc_dday(date(2026, 10, 1), date(2026, 10, 16)) == "마감"
    assert ec.calc_dday(None) == "접수중"
    # SSRF: 내부망/비표준 주소는 거부
    for bad in ("http://localhost:8000/x", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "file:///etc/passwd", "https://example.com:22/"):
        assert not ec.is_safe_public_url(bad), bad

if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn(); n += 1
    print(f"OK {n} groups")
