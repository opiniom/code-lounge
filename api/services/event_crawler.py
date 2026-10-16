"""이벤트(공모전·해커톤·개발자 행사) 자동 수집.

원칙
- robots.txt 가 허용하는 곳만 읽는다. 요청마다 식별 가능한 User-Agent 를 쓰고, 같은 사이트에는 천천히(1초 간격) 요청한다.
- 제목·주소·주최·날짜·태그 같은 '사실 정보'와 원문 링크만 저장한다 (본문을 통째로 복사하지 않는다). 카드에는 출처를 표시하고 원문으로 연결한다.
- 출처 하나가 실패해도 나머지는 계속 돌고, 실패 이유는 화면에 보인다.

출처
- devevent : 한국 개발자 행사·대회 목록 (GitHub brave-people/Dev-Event 의 공개 README)
- wevity   : 공모전 포털 목록 중 IT·SW 분야만
- feeds    : 설정(EVENT_FEEDS)에 넣은 RSS/Atom 주소
"""
import asyncio
import hashlib
import html as htmllib
import json
import logging
import re
import urllib.robotparser as robotparser
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
from sqlalchemy import select, func, or_

from config import settings
from database import async_session_maker
from models import CrawledEvent, EventCrawlRun

logger = logging.getLogger(__name__)

USER_AGENT = "DureSyncBot/0.1 (+https://github.com/opiniom/code-lounge; team project crawler)"
REQUEST_GAP_SECONDS = 1.0
SOURCE_LABELS = {"devevent": "Dev-Event", "wevity": "위비티", "contestkorea": "콘테스트코리아", "feed": "RSS", "manual": "직접 등록"}
VISIBLE_DAYS_AFTER_LAST_SEEN = 7        # 이 기간 동안 목록에서 안 보이면 화면에서도 내린다 (직접 등록한 것은 제외)

# ======================================================================
# 공통 도구
# ======================================================================
_TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref"}


def canonical_url(url: str) -> str:
    p = urlparse((url or "").strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if k.lower() not in _TRACKING]
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path, p.params, urlencode(q), ""))


def make_key(source: str, url: str) -> str:
    return hashlib.sha1(f"{source}|{canonical_url(url)}".encode("utf-8")).hexdigest()


def calc_dday(deadline: Optional[date], today: Optional[date] = None) -> str:
    if deadline is None:
        return "접수중"
    diff = (deadline - (today or date.today())).days
    return "마감" if diff < 0 else ("D-Day" if diff == 0 else f"D-{diff}")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


_HACK_RE = re.compile(r"해커톤|hackathon|아이디어톤|ideathon|해커 톤", re.I)
_ACTIVITY_RE = re.compile(r"서포터즈|기자단|체험단|인턴|동아리|봉사|대외활동|앰배서더|멘토단|홍보대사|탐방|연수", re.I)
_SEMINAR_RE = re.compile(r"세미나|컨퍼런스|conference|웨비나|webinar|밋업|meetup|모임|강연|summit|포럼|데모데이|demo day", re.I)
_CONTEST_RE = re.compile(r"공모전|경진|대회|챌린지|challenge|contest|competition|어워드|award", re.I)


def guess_category(title: str, tags: List[str]) -> str:
    blob = title + " " + " ".join(tags)
    if _HACK_RE.search(blob):
        return "해커톤"
    if "대회" in tags or _CONTEST_RE.search(title):
        return "공모전"
    if _ACTIVITY_RE.search(blob):
        return "대외활동"
    if _SEMINAR_RE.search(blob):
        return "세미나"
    return "기타"


# ======================================================================
# robots.txt
# ======================================================================
_robots_cache: Dict[str, Tuple[float, Optional[robotparser.RobotFileParser]]] = {}
_DENY_ALL = ["User-agent: *", "Disallow: /"]


def _deny_all_parser() -> robotparser.RobotFileParser:
    rp = robotparser.RobotFileParser(); rp.parse(_DENY_ALL); return rp


async def robots_allowed(client: httpx.AsyncClient, url: str) -> bool:
    """사이트의 robots.txt 가 우리 봇에게 이 주소를 허용하는지. (파일이 없으면 제한 없음, 서버 오류·접속 실패면 조심해서 막음)"""
    p = urlparse(url)
    host = f"{p.scheme}://{p.netloc}"
    now = datetime.utcnow().timestamp()
    cached = _robots_cache.get(host)
    if cached is None or now - cached[0] >= 6 * 3600:
        rp: Optional[robotparser.RobotFileParser]
        try:
            r = await client.get(f"{host}/robots.txt", timeout=10)
            if r.status_code == 200:
                rp = robotparser.RobotFileParser(); rp.parse(r.text.splitlines())
            elif 400 <= r.status_code < 500:
                rp = None                                  # robots.txt 없음 = 제한 없음
            else:
                rp = _deny_all_parser()
        except Exception:
            rp = _deny_all_parser()
        cached = (now, rp)
        _robots_cache[host] = cached
    rp = cached[1]
    return True if rp is None else rp.can_fetch(USER_AGENT, url)


_GENERIC_IMG = re.compile(r"logo|favicon|default|noimg|no_img|noimage|placeholder|social-icon|main_img|sprite|blank|og-default|/images/btn_", re.I)


def normalize_image_url(raw: Optional[str], base_url: str) -> Optional[str]:
    """포스터 주소를 안전한 https 주소로. (서버가 이미지를 내려받지는 않는다 — 브라우저가 직접 불러온다)"""
    if not raw:
        return None
    u = urljoin(base_url, htmllib.unescape(raw.strip()))
    if u.startswith("http://"):
        u = "https://" + u[len("http://"):]
    if not u.startswith("https://") or len(u) > 500 or _GENERIC_IMG.search(u):
        return None
    return u


def extract_og_image(page_html: str, base_url: str) -> Optional[str]:
    metas: Dict[str, str] = {}
    for tag in re.findall(r"<meta\b[^>]*>", page_html[:250000], re.I):
        prop = re.search(r'(?:property|name)=["\']([^"\']+)["\']', tag, re.I)
        content = re.search(r'content=["\']([^"\']*)["\']', tag, re.I)
        if prop and content:
            metas.setdefault(prop.group(1).lower(), content.group(1))
    raw = metas.get("og:image:secure_url") or metas.get("og:image") or metas.get("twitter:image") or metas.get("twitter:image:src")
    return normalize_image_url(raw, base_url)


_last_request: Dict[str, float] = {}
_host_locks: Dict[str, asyncio.Lock] = {}


async def polite_get(client: httpx.AsyncClient, url: str) -> httpx.Response:
    """한 사이트에는 동시에 하나만, 요청 사이에 간격을 두고 가져온다 (여러 사이트는 동시에 가능)"""
    host = urlparse(url).netloc
    lock = _host_locks.setdefault(host, asyncio.Lock())
    async with lock:
        return await _polite_get_locked(client, url)


async def _polite_get_locked(client: httpx.AsyncClient, url: str) -> httpx.Response:
    """robots.txt 확인 + 같은 사이트 요청 사이 간격 두기"""
    if not await robots_allowed(client, url):
        raise PermissionError("이 사이트의 robots.txt 가 자동 수집을 허용하지 않아요")
    host = urlparse(url).netloc
    wait = REQUEST_GAP_SECONDS - (asyncio.get_event_loop().time() - _last_request.get(host, 0))
    if wait > 0:
        await asyncio.sleep(wait)
    try:
        r = await client.get(url, timeout=20)
    finally:
        _last_request[host] = asyncio.get_event_loop().time()
    r.raise_for_status()
    return r


# ======================================================================
# 사용자가 직접 넣은 주소를 읽을 때의 안전장치 (SSRF 방지)
# ======================================================================
import ipaddress
import socket


def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
    return bool(infos)


def is_safe_public_url(url: str) -> bool:
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    if p.port not in (None, 80, 443):
        return False
    return _host_is_public(p.hostname)


async def safe_fetch(client: httpx.AsyncClient, url: str, max_redirects: int = 3) -> httpx.Response:
    """내부망 주소(localhost, 사설 IP, 클라우드 메타데이터 등)로 가는 요청은 리다이렉트 중에도 막는다"""
    current = url
    for _ in range(max_redirects + 1):
        if not await asyncio.to_thread(is_safe_public_url, current):
            raise PermissionError("공개된 웹 주소(http/https)만 읽을 수 있어요")
        r = await client.get(current, timeout=12, follow_redirects=False)
        if r.is_redirect and r.headers.get("location"):
            current = urljoin(current, r.headers["location"]); continue
        return r
    raise PermissionError("리다이렉트가 너무 많아요")


# ======================================================================
# 출처 1) Dev-Event (GitHub README)
# ======================================================================
DEVEVENT_URL = "https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md"
_MONTH_HEAD = re.compile(r"^## `(\d{2})년 (\d{1,2})월`")
_ITEM = re.compile(r"^- __\[(.*)\]\((\S+?)\)__\s*$")
_FIELD = re.compile(r"^\s+- (분류|주최|접수|일시|기간|장소):\s*(.*?)\s*$")
_MD = re.compile(r"(\d{1,2})\.\s*(\d{1,2})")


def _dates_in(text: str, section_year: int, section_month: int) -> Tuple[Optional[date], Optional[date]]:
    """'09. 28(월) 15:30 ~ 10. 14(수) 19:30' → (시작일, 종료일). 연도는 월 섹션 기준으로 보정."""
    toks = [(int(m), int(d)) for m, d in _MD.findall(re.sub(r"\d{1,2}:\d{2}", "", text))]
    toks = [(m, d) for m, d in toks if 1 <= m <= 12 and 1 <= d <= 31]
    if not toks:
        return None, None
    sm, sd = toks[0]
    sy = section_year - 1 if sm - section_month > 6 else section_year      # 1월 섹션의 12월 시작 등
    try:
        start = date(sy, sm, sd)
        if len(toks) == 1:
            return start, start
        em, ed = toks[-1]
        ey = sy + (1 if em < sm else 0)
        return start, date(ey, em, ed)
    except ValueError:
        return None, None


def parse_devevent(md: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    year = month = None
    cur: Optional[Dict[str, Any]] = None

    def flush():
        nonlocal cur
        if cur and year:
            items.append(cur)
        cur = None

    for line in md.splitlines():
        mh = _MONTH_HEAD.match(line)
        if mh:
            flush(); year, month = 2000 + int(mh.group(1)), int(mh.group(2)); continue
        if line.startswith("## "):          # 월 섹션이 아닌 곳(지난 행사, 동아리 …)은 건너뜀
            flush(); year = month = None; continue
        if year is None:
            continue
        mi = _ITEM.match(line)
        if mi:
            flush(); cur = {"title": _clean(mi.group(1)), "url": mi.group(2), "fields": {}, "_y": year, "_m": month}; continue
        mf = _FIELD.match(line)
        if mf and cur is not None:
            cur["fields"][mf.group(1)] = mf.group(2)
    flush()

    out: List[Dict[str, Any]] = []
    for it in items:
        f = it["fields"]
        tags = re.findall(r"`([^`]+)`", f.get("분류", ""))
        reg_s, reg_e = _dates_in(f.get("접수", ""), it["_y"], it["_m"]) if f.get("접수") else (None, None)
        ev_s, ev_e = _dates_in(f.get("일시", f.get("기간", "")), it["_y"], it["_m"]) if (f.get("일시") or f.get("기간")) else (None, None)
        deadline = reg_e or ev_e or ev_s
        where = next((t for t in tags if t.startswith("오프라인") or t == "온라인"), "")
        price = next((t for t in tags if t in ("무료", "유료")), "")
        topics = [t for t in tags if t not in (where, price) and t not in ("대회", "세미나", "모임")]
        bits = [b for b in (where, price, ", ".join(topics[:3])) if b]
        sched = []
        if reg_s:
            sched.append(f"접수 {reg_s:%m.%d}" + (f"~{reg_e:%m.%d}" if reg_e and reg_e != reg_s else ""))
        if ev_s:
            sched.append(f"행사 {ev_s:%m.%d}" + (f"~{ev_e:%m.%d}" if ev_e and ev_e != ev_s else ""))
        out.append({
            "source": "devevent", "title": it["title"][:300], "url": it["url"], "category": guess_category(it["title"], tags),
            "host": f.get("주최", "")[:200] or None, "deadline_date": deadline, "starts_on": ev_s,   # 행사일은 '일시'가 있을 때만
            "tags": tags, "description": " · ".join(bits + sched)[:400],
        })
    return out


async def fetch_devevent(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    r = await polite_get(client, DEVEVENT_URL)
    return parse_devevent(r.text)


# ======================================================================
# 출처 2) 위비티 (IT·SW 분야만)
# ======================================================================
WEVITY_BASE = "https://www.wevity.com/"
WEVITY_LIST = "https://www.wevity.com/?c=find&s=1&gub=1&cidx={cidx}&pn={n}"
WEVITY_IT_CATEGORIES = (20, 21, 22)      # 웹/모바일/IT · 게임/소프트웨어 · 과학/공학 (위비티가 제공하는 분야별 목록)
WEVITY_PAGES = 2
_WEVITY_ITEM = re.compile(
    r'<div class="tit">\s*<a href="([^"]+)">(.*?)</a>\s*<div class="sub-tit">(.*?)</div>\s*</div>\s*'
    r'<div class="organ">(.*?)</div>\s*<div class="day">\s*(.*?)</div>', re.S)
_IT_FIELD = re.compile(r"웹/모바일/IT|과학/공학")
_IT_STRONG = re.compile(r"해커톤|hackathon|아이디어톤|개발|소프트웨어|\bSW\b|\bAI\b|인공지능|데이터|코딩|프로그래밍|알고리즘|오픈소스|보안|해킹|클라우드|블록체인|메타버스|로봇|\bIT\b|앱\s|애플리케이션|스타트업|창업", re.I)
_NON_IT = re.compile(r"사진|영상|UCC|포스터|슬로건|네이밍|웹툰|캘리|글쓰기|수기|에세이|논문|사생|미술|음악|공연|디자인|캐릭터|작품|콘텐츠|숏폼|릴스|광고|카피", re.I)
_LABELS_TAIL = re.compile(r"(?:\s+(?:SPECIAL|IDEA|NEW|HOT|MD추천|추천|신규))+\s*$")


def _is_it_related(title: str, fields: str) -> bool:
    if _IT_STRONG.search(title):
        return True
    n_fields = len([f for f in fields.split(",") if f.strip()])
    return bool(_IT_FIELD.search(fields)) and n_fields <= 3 and not _NON_IT.search(title)


def parse_wevity(page_html: str, today: Optional[date] = None, it_page: bool = False) -> List[Dict[str, Any]]:
    today = today or date.today()
    out = []
    for href, title_html, sub_html, organ_html, day_html in _WEVITY_ITEM.findall(page_html):
        title = _clean(title_html)
        title = _LABELS_TAIL.sub("", title).strip()
        fields = _clean(sub_html).replace("분야 :", "").strip()
        if it_page:      # 위비티의 IT 분야 목록에서 온 것: 명백히 IT가 아닌 제목(영상·슬로건 등)만 걸러낸다
            if _NON_IT.search(title) and not _IT_STRONG.search(title):
                continue
        elif not _is_it_related(title, fields):
            continue
        day = _clean(day_html)
        m = re.search(r"D-(\d+)", day)
        if m:
            deadline = today + timedelta(days=int(m.group(1)))
        elif re.search(r"D-?DAY|오늘", day, re.I):
            deadline = today
        elif "마감" in day:
            continue                         # 이미 끝난 공모전
        else:
            deadline = None                  # 상시/미정
        tags = [t.strip() for t in fields.split(",") if t.strip()][:5]
        out.append({
            "source": "wevity", "title": title[:300], "url": urljoin(WEVITY_BASE, htmllib.unescape(href)),
            "category": "해커톤" if _HACK_RE.search(title) else "공모전", "host": _clean(organ_html)[:200] or None,
            "deadline_date": deadline, "starts_on": None, "tags": tags,
            "description": ("분야 · " + ", ".join(tags))[:400] if tags else "",
        })
    return out


async def fetch_wevity(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen = set()
    for cidx in WEVITY_IT_CATEGORIES:
        for n in range(1, WEVITY_PAGES + 1):
            r = await polite_get(client, WEVITY_LIST.format(cidx=cidx, n=n))
            for it in parse_wevity(r.text, it_page=True):
                dup_key = (re.sub(r"\W+", "", it["title"]).lower(), it["deadline_date"])      # 같은 공고가 다른 주소로 두 번 올라온 경우
                if it["url"] not in seen and dup_key not in seen:
                    seen.add(it["url"]); seen.add(dup_key); items.append(it)
    return items


# ======================================================================
# 출처 3) 콘테스트코리아 (대외활동 + IT 공모전)
# ======================================================================
CK_BASE = "https://www.contestkorea.com/sub/"
CK_LIST = "https://www.contestkorea.com/sub/list.php?int_gbn={gbn}&displayrow=24&page={n}"
CK_PAGES = 3
_CK_IT_CATEGORY = re.compile(r"IT|과학|학문|소프트|게임|창업|아이디어")
_CK_ITEM = re.compile(r'<div class="title">\s*<a href="(view\.php[^"]+)">\s*<span class="category">(.*?)</span>(.*?)<span class="txt">(.*?)</span>(.*?)(?=<div class="title">|<!-- pagination -->|\Z)', re.S)


def _ck_deadline(seg: str, today: date) -> Tuple[Optional[date], bool]:
    """(마감일, 이미 끝났는지). D-day 숫자가 있으면 그것이 가장 정확하다."""
    m = re.search(r'<span class="day">\s*D-(\d+)', seg)
    if m:
        return today + timedelta(days=int(m.group(1))), False
    if re.search(r'<span class="day">\s*D-?DAY', seg, re.I):      # (class="d-day" 같은 이름과 헷갈리지 않게 표시 글자만 본다)
        return today, False
    cond = _clean(re.search(r'<span class="condition">(.*?)</span>', seg, re.S).group(1)) if re.search(r'<span class="condition">', seg) else ""
    if "마감" in cond:
        return None, True
    m = re.search(r'<span class="step-1"><em>접수</em>\s*(?:\d{2}\.\d{2}~)?(\d{2})\.(\d{2})', seg)       # 접수예정: 접수 마감일
    if m:
        for y in (today.year, today.year + 1):
            try:
                d = date(y, int(m.group(1)), int(m.group(2)))
            except ValueError:
                continue
            if d >= today - timedelta(days=1):
                return d, False
    return None, False


def parse_contestkorea(page_html: str, gbn: int, today: Optional[date] = None) -> List[Dict[str, Any]]:
    today = today or date.today()
    i = page_html.find('<div class="list_style_2"')
    body = page_html[i:] if i >= 0 else ""
    out = []
    for href, cat_html, _mid, title_html, seg in _CK_ITEM.findall(body):
        title = _clean(title_html)
        cats = [c.strip() for c in re.split(r"[•·]", _clean(cat_html).replace(" ", "")) if c.strip()]
        cat_text = _clean(cat_html)
        deadline, ended = _ck_deadline(seg, today)
        if ended or not title:
            continue
        if gbn == 1 and not (_CK_IT_CATEGORY.search(cat_text) and not _NON_IT.search(title) or _IT_STRONG.search(title)):
            continue                                   # 공모전은 IT·학문·창업 분야만 (영상·음악·미술 등 제외)
        hm = re.search(r'<li class="icon_1"><strong>주최</strong>\s*\.\s*(.*?)</li>', seg, re.S)
        tm = re.search(r'<li class="icon_2"><strong>대상</strong>\s*\.\s*(.*?)</li>', seg, re.S)
        sm = re.search(r'<span class="step-2"><em>(?:활동|행사|개최|대회)</em>\s*(\d{2})\.(\d{2})', seg)
        starts = None
        if sm:
            for y in (today.year, today.year + 1):
                try:
                    cand = date(y, int(sm.group(1)), int(sm.group(2)))
                except ValueError:
                    continue
                if cand >= today - timedelta(days=30):
                    starts = cand; break
        tags = cats[:5] + ([_clean(tm.group(1))[:20]] if tm else [])
        category = "대외활동" if gbn == 2 else ("해커톤" if _HACK_RE.search(title) else "공모전")
        out.append({
            "source": "contestkorea", "title": title[:300], "url": urljoin(CK_BASE, htmllib.unescape(href)),
            "category": category, "host": (_clean(hm.group(1))[:200] if hm else None) or None,
            "deadline_date": deadline, "starts_on": starts, "tags": tags,
            "description": ("분야 · " + ", ".join(cats[:4]) + ((" · 대상 " + _clean(tm.group(1))[:30]) if tm else ""))[:400],
        })
    return out


async def fetch_contestkorea(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen = set()
    for gbn in (2, 1):                    # 대외활동, 공모전
        for n in range(1, CK_PAGES + 1):
            r = await polite_get(client, CK_LIST.format(gbn=gbn, n=n))
            for it in parse_contestkorea(r.text, gbn):
                if it["url"] not in seen:
                    seen.add(it["url"]); items.append(it)
    return items


# ======================================================================
# 출처 4) RSS / Atom
# ======================================================================
def parse_feed(xml_text: str, feed_url: str = "") -> List[Dict[str, Any]]:
    if "<!DOCTYPE" in xml_text[:2000].upper():          # 외부 엔티티 같은 위험한 구성은 읽지 않는다
        raise ValueError("DOCTYPE 이 포함된 피드는 읽지 않아요")
    root = ET.fromstring(xml_text)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    site = _clean((root.findtext("channel/title") or root.findtext("a:title", namespaces=ns) or urlparse(feed_url).netloc))[:200]
    out = []
    entries = root.findall("channel/item") or root.findall("a:entry", ns)
    for e in entries[:100]:
        title = _clean(e.findtext("title") or e.findtext("a:title", namespaces=ns) or "")
        link = (e.findtext("link") or "").strip()
        if not link:
            le = e.find("a:link", ns)
            link = (le.get("href") if le is not None else "") or ""
        if not title or not link.startswith("http"):
            continue
        desc = _clean(e.findtext("description") or e.findtext("a:summary", namespaces=ns) or "")[:300]
        out.append({
            "source": "feed", "title": title[:300], "url": link, "category": guess_category(title, []),
            "host": site or None, "deadline_date": None, "starts_on": None, "tags": [], "description": desc,
        })
    return out


async def fetch_feeds(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for url in [u.strip() for u in settings.EVENT_FEEDS.split(",") if u.strip()]:
        r = await polite_get(client, url)
        out.extend(parse_feed(r.text, url))
    return out


SOURCES: Dict[str, Callable[[httpx.AsyncClient], Awaitable[List[Dict[str, Any]]]]] = {
    "devevent": fetch_devevent, "wevity": fetch_wevity, "contestkorea": fetch_contestkorea, "feeds": fetch_feeds,
}
SOURCE_ALIAS = {"feeds": "feed"}      # 설정 이름 → 저장되는 source 값


def enabled_sources() -> List[str]:
    names = [s.strip().lower() for s in settings.EVENT_SOURCES.split(",") if s.strip()]
    return [n for n in names if n in SOURCES]


# ======================================================================
# 저장 (중복 없이 추가/갱신)
# ======================================================================
async def upsert_events(db, source: str, items: List[Dict[str, Any]]) -> Tuple[int, int]:
    now = datetime.utcnow()
    added = updated = 0
    keyed = {}
    for it in items:
        keyed[make_key(source, it["url"])] = it                   # 같은 주소가 겹치면 마지막 것
    keys = list(keyed)
    existing: Dict[str, CrawledEvent] = {}
    for i in range(0, len(keys), 400):
        rows = (await db.execute(select(CrawledEvent).where(CrawledEvent.source == source, CrawledEvent.ext_key.in_(keys[i:i + 400])))).scalars().all()
        existing.update({r.ext_key: r for r in rows})
    for key, it in keyed.items():
        tags_json = json.dumps(it.get("tags") or [], ensure_ascii=False)
        row = existing.get(key)
        if row is None:
            db.add(CrawledEvent(
                user_id=None, url=canonical_url(it["url"]), title=it["title"], category=it["category"], host=it.get("host"),
                deadline=it["deadline_date"].isoformat() if it.get("deadline_date") else None,
                d_day=calc_dday(it.get("deadline_date")), description=it.get("description") or "",
                source=source, ext_key=key, deadline_date=it.get("deadline_date"), starts_on=it.get("starts_on"),
                tags=tags_json, first_seen_at=now, last_seen_at=now,
            ))
            added += 1
        else:
            changed = False
            for attr, val in (("title", it["title"]), ("category", it["category"]), ("host", it.get("host")),
                              ("description", it.get("description") or ""), ("deadline_date", it.get("deadline_date")),
                              ("starts_on", it.get("starts_on")), ("tags", tags_json)):
                if getattr(row, attr) != val:
                    setattr(row, attr, val); changed = True
            if changed:
                row.deadline = row.deadline_date.isoformat() if row.deadline_date else None
                updated += 1
            row.last_seen_at = now
    # 출처 목록에서 사라진(또는 필터에서 빠진) '아직 접수중인' 항목은 정리한다. 지난 것은 기록으로 남긴다.
    keyset = set(keys)
    stale = (await db.execute(select(CrawledEvent).where(
        CrawledEvent.source == source, or_(CrawledEvent.deadline_date.is_(None), CrawledEvent.deadline_date >= date.today())))).scalars().all()
    removed = 0
    for row in stale:
        if row.ext_key not in keyset:
            await db.delete(row); removed += 1
    await db.commit()
    if removed:
        logger.info("이벤트 수집(%s): 목록에서 사라진 %d건 정리", source, removed)
    return added, updated


# ======================================================================
# 실행 / 스케줄
# ======================================================================
_lock = asyncio.Lock()
_state: Dict[str, Any] = {"running": False}


def is_running() -> bool:
    return _lock.locked()


async def run_source(client: httpx.AsyncClient, name: str, trigger: str) -> Dict[str, Any]:
    source = SOURCE_ALIAS.get(name, name)
    run = EventCrawlRun(source=source, trigger=trigger, started_at=datetime.utcnow())
    result = {"source": source, "ok": False, "found": 0, "added": 0, "updated": 0, "error": None}
    try:
        items = await SOURCES[name](client)
        if not items:      # 결과가 비면 사이트 구조가 바뀌었을 가능성이 크다 → 기존 데이터를 건드리지 않고 실패로 기록
            raise ValueError("수집 결과가 비어 있어요 (사이트 구조가 바뀌었을 수 있어요)")
        async with async_session_maker() as db:
            added, updated = await upsert_events(db, source, items)
        result.update(ok=True, found=len(items), added=added, updated=updated)
    except PermissionError as exc:
        result["error"] = str(exc)
    except httpx.HTTPStatusError as exc:
        result["error"] = f"HTTP {exc.response.status_code}"
    except Exception as exc:                                  # 한 출처의 문제가 다른 출처를 막지 않게
        logger.warning("이벤트 수집 실패(%s): %s", name, exc)
        result["error"] = f"{type(exc).__name__}: {str(exc)[:120]}"
    run.finished_at = datetime.utcnow(); run.ok = result["ok"]; run.found = result["found"]
    run.added = result["added"]; run.updated = result["updated"]; run.error = result["error"]
    async with async_session_maker() as db:
        db.add(run)
        await db.commit()
    return result


async def refresh_all(trigger: str = "schedule") -> Dict[str, Any]:
    """모든 출처를 한 번씩 갱신. 이미 돌고 있으면 새로 시작하지 않는다."""
    if _lock.locked():
        return {"started": False, "reason": "already_running"}
    async with _lock:
        results = []
        async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT, "Accept-Language": "ko,en;q=0.8"}, follow_redirects=True) as client:
            for name in enabled_sources():
                results.append(await run_source(client, name, trigger))
            images = 0
            try:
                images = await enrich_images(client, settings.EVENT_IMAGE_BATCH)
            except Exception:
                logger.exception("이벤트 포스터 수집 오류")
        await _prune_runs()
        return {"started": True, "results": results, "images": images}


async def enrich_images(client: httpx.AsyncClient, limit: int) -> int:
    """새로 들어온 이벤트의 포스터(og:image) 주소를 찾는다. 한 번에 limit 개까지, 같은 사이트는 천천히.
    주소만 저장하고 이미지를 서버가 내려받지는 않는다 (브라우저가 원본 사이트에서 직접 불러옴)."""
    if limit <= 0:
        return 0
    now = datetime.utcnow()
    async with async_session_maker() as db:
        rows = (await db.execute(select(CrawledEvent).where(
            CrawledEvent.image_url.is_(None), CrawledEvent.source != "manual",
            or_(CrawledEvent.image_checked_at.is_(None), CrawledEvent.image_checked_at < now - timedelta(days=3)),
            or_(CrawledEvent.deadline_date.is_(None), CrawledEvent.deadline_date >= date.today()),
        ).order_by(CrawledEvent.image_checked_at.asc(), CrawledEvent.deadline_date.asc(), CrawledEvent.first_seen_at.desc()).limit(limit))).scalars().all()   # 아직 안 찾아본 것 먼저, 마감이 가까운 것부터
        if not rows:
            return 0
        sem = asyncio.Semaphore(4)

        async def one(url: str) -> Optional[str]:
            async with sem:
                try:
                    r = await polite_get(client, url)
                    if "html" not in r.headers.get("content-type", "").lower():
                        return None
                    return extract_og_image(r.text, str(r.url))
                except Exception:
                    return None

        found = await asyncio.gather(*[one(r.url) for r in rows])
        n = 0
        for row, img in zip(rows, found):
            row.image_checked_at = now
            if img:
                row.image_url = img; n += 1
        await db.commit()
        # 같은 그림이 여러 행사에 붙어 있으면 그 사이트의 기본(공용) 이미지라서 쓰지 않는다
        withimg = (await db.execute(select(CrawledEvent).where(CrawledEvent.image_url.is_not(None), CrawledEvent.source != "manual"))).scalars().all()
        counts: Dict[str, int] = {}
        for r in withimg:
            counts[r.image_url] = counts.get(r.image_url, 0) + 1
        for r in withimg:
            if counts[r.image_url] >= 4:
                r.image_url = None; r.image_checked_at = now
        await db.commit()
        return n


async def _prune_runs(keep: int = 200):
    async with async_session_maker() as db:
        ids = (await db.execute(select(EventCrawlRun.id).order_by(EventCrawlRun.id.desc()).offset(keep))).scalars().all()
        if ids:
            from sqlalchemy import delete
            await db.execute(delete(EventCrawlRun).where(EventCrawlRun.id.in_(ids)))
            await db.commit()


async def last_finished_at() -> Optional[datetime]:
    async with async_session_maker() as db:
        return (await db.execute(select(func.max(EventCrawlRun.finished_at)))).scalar_one_or_none()


async def scheduler_loop():
    """서버가 켜져 있는 동안 주기적으로 최신화. 처음에는 부팅을 방해하지 않게 잠깐 기다린다."""
    await asyncio.sleep(15)
    interval = timedelta(hours=max(1, settings.EVENT_CRAWL_INTERVAL_HOURS))
    while True:
        try:
            last = await last_finished_at()
            if last is None or datetime.utcnow() - last >= interval:
                await refresh_all("schedule")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("이벤트 자동 수집 스케줄러 오류")
        await asyncio.sleep(600)         # 10분마다 '갱신할 때가 됐나' 확인
