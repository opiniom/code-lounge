import re
import httpx
from datetime import datetime, date
from html.parser import HTMLParser
from typing import Optional, Dict, Any, List

class MetaHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.in_title = False
        self.meta_tags: Dict[str, str] = {}
        self.body_texts: List[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = {k.lower(): v for k, v in attrs if v is not None}
        if tag.lower() == "title":
            self.in_title = True
        elif tag.lower() == "meta":
            prop = attrs_dict.get("property") or attrs_dict.get("name") or ""
            content = attrs_dict.get("content") or ""
            if prop and content:
                self.meta_tags[prop.lower()] = content.strip()

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data.strip()
        else:
            cleaned = data.strip()
            if len(cleaned) > 2:
                self.body_texts.append(cleaned)


def _calc_dday(deadline_str: Optional[str]) -> str:
    if not deadline_str:
        return "접수중"
    m = re.search(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})", deadline_str)
    if m:
        try:
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            diff = (d - date.today()).days
            if diff < 0:
                return "마감"
            elif diff == 0:
                return "D-Day"
            else:
                return f"D-{diff}"
        except Exception:
            pass
    return "접수중"


async def crawl_target_url(url: str, custom_category: Optional[str] = None) -> Dict[str, Any]:
    """사용자가 입력한 임의의 웹사이트 URL을 방문하여 공모전/해커톤 정보를 추출"""
    clean_url = url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = "https://" + clean_url

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    from services.event_crawler import safe_fetch      # 사용자가 넣은 주소는 내부망으로 가지 못하게 검사하며 읽는다
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            resp = await safe_fetch(client, clean_url)
            html_text = resp.text
    except PermissionError:
        raise
    except Exception as e:
        # 크롤링 요청 실패 시 URL 기반 휴리스틱 데이터 생성
        title_from_url = clean_url.split("//")[-1].split("/")[0]
        return {
            "url": clean_url,
            "title": f"공모전/해커톤 ({title_from_url})",
            "category": custom_category or "공모전",
            "host": title_from_url,
            "deadline": date.today().isoformat(),
            "d_day": "접수중",
            "description": f"URL {clean_url} 에서 수집된 이벤트입니다. (접속 응답: {str(e)[:50]})"
        }

    parser = MetaHTMLParser()
    try:
        parser.feed(html_text)
    except Exception:
        pass

    og_title = parser.meta_tags.get("og:title")
    og_desc = parser.meta_tags.get("og:description")
    og_site = parser.meta_tags.get("og:site_name")
    from services.event_crawler import normalize_image_url
    image_url = normalize_image_url(parser.meta_tags.get("og:image") or parser.meta_tags.get("twitter:image"), clean_url)

    title = og_title or parser.title or "새로운 공모전 / 해커톤"
    title = re.sub(r"\s+", " ", title).strip()

    description = og_desc or "상세 공고 내용을 확인하세요."
    if len(parser.body_texts) > 0 and len(description) < 30:
        description = " ".join(parser.body_texts[:10])[:300]

    # 카테고리 판별
    full_corpus = (title + " " + description).lower()
    if custom_category:
        category = custom_category
    elif any(k in full_corpus for k in ["해커톤", "hackathon", "챌린지"]):
        category = "해커톤"
    elif any(k in full_corpus for k in ["공모전", "대회", "경진대회", "contest"]):
        category = "공모전"
    else:
        category = "공모전"

    # 주최기관 파악
    host = og_site or ""
    if not host:
        host_match = re.search(r"(주최|주관)\s*[:：]?\s*([^\n\r,·|]{2,30})", description)
        if host_match:
            host = host_match.group(2).strip()
        else:
            host = clean_url.split("//")[-1].split("/")[0]

    # 마감일 패턴 파악 (YYYY-MM-DD or YYYY.MM.DD)
    date_match = re.search(r"(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})", description)
    if date_match:
        deadline = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
    else:
        deadline = ""

    d_day = _calc_dday(deadline)

    return {
        "url": clean_url,
        "title": title[:300],
        "category": category,
        "host": host[:200],
        "deadline": deadline or None,
        "d_day": d_day,
        "description": description[:500],
        "image_url": image_url,
    }
