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


# =========================================================================
# [개발자 임의 설정] 크롤링 대상 사이트 URL 목록
# 원하는 공모전/해커톤 웹페이지 주소를 코드상에서 자유롭게 등록/수정하세요.
# =========================================================================
CONFIGURED_CRAWL_URLS = [
    {
        "url": "https://dacon.io/competitions/official/236200/overview",
        "category": "해커톤",
    },
    {
        "url": "https://www.oss.kr/competition",
        "category": "공모전",
    },
    {
        "url": "https://wevity.com",
        "category": "공모전",
    },
    {
        "url": "https://thinkcontest.com",
        "category": "해커톤",
    }
]

PRESET_EVENTS = [
    {
        "id": -1,
        "url": "https://dacon.io/competitions/official/236200/overview",
        "title": "2026 대학생 생성형 AI 해커톤",
        "category": "해커톤",
        "host": "과학기술정보통신부 · 인공지능연구원",
        "deadline": "2026-10-18",
        "d_day": "D-5",
        "description": "생성형 AI 모델을 활용한 대학생 협업 프로덕트 개발 해커톤 대회",
        "created_at": "2026-10-10T09:00:00Z"
    },
    {
        "id": -2,
        "url": "https://www.oss.kr/competition",
        "title": "제12회 오픈소스 SW 개발 공모전",
        "category": "공모전",
        "host": "정보통신산업진흥원 · 공개SW역량프라자",
        "deadline": "2026-10-25",
        "d_day": "D-12",
        "description": "국내외 오픈소스 생태계를 발전시킬 창의적인 공개 소프트웨어 개발 프로젝트",
        "created_at": "2026-10-08T11:00:00Z"
    },
    {
        "id": -3,
        "url": "https://wevity.com",
        "title": "캠퍼스 스타트업 ICT 아이디어 챌린지",
        "category": "공모전",
        "host": "창업진흥원",
        "deadline": "2026-11-05",
        "d_day": "D-23",
        "description": "대학생 예비 창업팀을 위한 비즈니스 모델 발굴 및 시제품 제작 지원 공모전",
        "created_at": "2026-10-05T14:00:00Z"
    },
    {
        "id": -4,
        "url": "https://thinkcontest.com",
        "title": "글로벌 클라우드 혁신 알고리즘 대회",
        "category": "해커톤",
        "host": "한국소프트웨어산업협회",
        "deadline": "2026-11-15",
        "d_day": "D-33",
        "description": "클라우드 분산 처리 및 고성능 인프라 최적화 알고리즘 개발 경진대회",
        "created_at": "2026-10-01T10:00:00Z"
    }
]


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

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(clean_url, headers=headers)
            html_text = resp.text
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
        "description": description[:500]
    }


async def crawl_all_configured_urls() -> List[Dict[str, Any]]:
    """코드에 등록된 CONFIGURED_CRAWL_URLS 목록을 일괄 크롤링"""
    results = []
    for item in CONFIGURED_CRAWL_URLS:
        try:
            res = await crawl_target_url(item["url"], item.get("category"))
            results.append(res)
        except Exception:
            pass
    return results

