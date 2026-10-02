"""회의록 → 일정 후보 추출.

1) GEMINI_API_KEY 가 있으면 Gemini, 없고 ANTHROPIC_API_KEY 가 있으면 Claude 로 분석
   (상대 날짜·기간·시간을 문맥으로 해석)
2) 키가 없거나 호출이 모두 실패하면 규칙 기반(정규식) 분석으로 자동 대체
"""
import json
import logging
import re
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

import httpx

from config import settings

logger = logging.getLogger("schedule_ai")

WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
WD = {name: i for i, name in enumerate(WEEKDAY_NAMES)}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


# ======================================================================
# 공통: 결과 정규화
# ======================================================================
def _normalize(raw: dict, fallback_title: str = "일정") -> Optional[Dict]:
    """모델/규칙 결과 1건을 검증해서 API 응답 형태로 정리. 날짜가 잘못되면 버린다."""
    try:
        start = date.fromisoformat(str(raw.get("start_date")))
        end_raw = raw.get("end_date") or raw.get("start_date")
        end = date.fromisoformat(str(end_raw))
    except (TypeError, ValueError):
        return None
    if end < start:
        end = start
    start_time = raw.get("start_time") if TIME_RE.match(str(raw.get("start_time") or "")) else None
    end_time = raw.get("end_time") if (start_time and TIME_RE.match(str(raw.get("end_time") or ""))) else None
    if end_time and end == start and end_time <= start_time:   # 모델이 시작 시각을 그대로 복사한 경우
        end_time = None
    title = str(raw.get("title") or "").strip()[:200] or fallback_title
    return {
        "title": title,
        "start_date": start,
        "end_date": end,
        "start_time": start_time,
        "end_time": end_time,
        "all_day": start_time is None,
        "source": str(raw.get("source") or "")[:300],
    }


def _dedupe(items: List[Dict]) -> List[Dict]:
    seen, out = set(), []
    for it in items:
        key = (it["title"], it["start_date"], it["end_date"], it["start_time"])
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


# ======================================================================
# 1) Claude 분석
# ======================================================================
_SYSTEM_PROMPT = (
    "당신은 팀 회의록에서 캘린더에 넣을 일정을 뽑아내는 도우미입니다.\n"
    "- 회의록에 실제로 적힌 일정만 뽑고, 근거 없는 일정은 만들지 마세요.\n"
    "- 회의, 마감, 제출, 발표, 행사, 모임, 배포처럼 날짜가 정해진 항목만 포함합니다. 날짜 언급이 없는 할 일은 제외합니다.\n"
    "- '내일', '다음주 화요일', '이번 주 금요일까지' 같은 상대 날짜는 사용자 메시지의 기준일을 기준으로 계산해 YYYY-MM-DD 로 바꿉니다. (주는 월요일에 시작)\n"
    "- 기간이 있으면(예: 9월 15일부터 17일까지) start_date 와 end_date 에 각각 넣고, 하루짜리면 end_date 는 start_date 와 같게 합니다.\n"
    "- '금요일까지'처럼 마감만 있으면 그 날짜 하루짜리 일정으로 둡니다.\n"
    "- 시간이 있으면 24시간제 HH:MM 으로, 없으면 null 로 둡니다.\n"
    "- title 은 20자 안팎의 짧은 명사구로, source 에는 근거가 된 원문 문장을 그대로 적습니다.\n"
    "- 일정이 없으면 빈 배열을 반환합니다."
)

_TOOL = {
    "name": "report_events",
    "description": "회의록에서 찾은 일정 목록을 보고합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "end_date": {"type": "string", "description": "YYYY-MM-DD, 하루짜리면 start_date 와 같음"},
                        "start_time": {"type": ["string", "null"], "description": "HH:MM 또는 null"},
                        "end_time": {"type": ["string", "null"], "description": "HH:MM 또는 null"},
                        "source": {"type": "string"},
                    },
                    "required": ["title", "start_date", "end_date"],
                },
            }
        },
        "required": ["events"],
    },
}


async def _detect_claude(text: str, reference: date, title: Optional[str]) -> List[Dict]:
    user_msg = (
        f"기준일(회의 날짜): {reference.isoformat()} ({WEEKDAY_NAMES[reference.weekday()]}요일)\n"
        f"회의록 제목: {title or '(없음)'}\n\n"
        f"회의록 본문:\n{text[:8000]}"
    )
    body = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": 1500,
        "system": _SYSTEM_PROMPT,
        "tools": [_TOOL],
        "tool_choice": {"type": "tool", "name": "report_events"},
        "messages": [{"role": "user", "content": user_msg}],
    }
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
    resp.raise_for_status()
    for block in resp.json().get("content", []):
        if block.get("type") == "tool_use":
            items = [_normalize(e) for e in block.get("input", {}).get("events", [])]
            return _dedupe([i for i in items if i])
    return []


_GEMINI_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "events": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "start_date": {"type": "STRING", "description": "YYYY-MM-DD"},
                    "end_date": {"type": "STRING", "description": "YYYY-MM-DD, 하루짜리면 start_date 와 같음"},
                    "start_time": {"type": "STRING", "nullable": True, "description": "HH:MM 또는 null"},
                    "end_time": {"type": "STRING", "nullable": True, "description": "HH:MM 또는 null"},
                    "source": {"type": "STRING"},
                },
                "required": ["title", "start_date", "end_date"],
            },
        }
    },
    "required": ["events"],
}


async def _detect_gemini(text: str, reference: date, title: Optional[str]) -> List[Dict]:
    user_msg = (
        f"기준일(회의 날짜): {reference.isoformat()} ({WEEKDAY_NAMES[reference.weekday()]}요일)\n"
        f"회의록 제목: {title or '(없음)'}\n\n"
        f"회의록 본문:\n{text[:8000]}"
    )
    body = {
        "systemInstruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": _GEMINI_SCHEMA,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent"
    # 키는 URL 이 아닌 헤더로 보내 로그에 남지 않게 한다
    headers = {"x-goog-api-key": settings.GEMINI_API_KEY, "content-type": "application/json"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
    resp.raise_for_status()
    parts = resp.json()["candidates"][0]["content"]["parts"]
    data = json.loads("".join(p.get("text", "") for p in parts))
    items = [_normalize(e) for e in data.get("events", [])]
    return _dedupe([i for i in items if i])


# ======================================================================
# 2) 규칙 기반 분석 (API 키 없이 동작)
# ======================================================================
_DATE_PATTERNS = [
    ("ymd", re.compile(r"(?P<y>\d{4})\s*[.\-/년]\s*(?P<m>\d{1,2})\s*[.\-/월]\s*(?P<d>\d{1,2})\s*일?")),
    ("md_kor", re.compile(r"(?P<m>\d{1,2})\s*월\s*(?P<d>\d{1,2})\s*일")),
    ("md_slash", re.compile(r"(?<![\d/.:])(?P<m>\d{1,2})/(?P<d>\d{1,2})(?![\d/:])")),
    ("rel_month_day", re.compile(r"(?P<rel>이번|다음|담)\s*달\s*(?P<d>\d{1,2})\s*일")),
    ("rel_week_wd", re.compile(r"(?P<rel>이번|다다음|다음|담)\s*주\s*(?P<wd>[월화수목금토일])요일")),
    ("rel_weekend", re.compile(r"(?P<rel>이번|다음|담)\s*주말")),
    ("rel_day", re.compile(r"(?P<w>오늘|내일|모레|글피)")),
    ("after_n", re.compile(r"(?P<n>\d{1,2})\s*(?P<u>일|주)\s*(?:뒤|후)")),
    ("bare_wd", re.compile(r"(?<![가-힣])(?P<wd>[월화수목금토일])요일")),
    ("bare_day", re.compile(r"(?<![\d월/.])(?P<d>\d{1,2})\s*일")),
]

_TIME_RE = re.compile(
    r"(?P<mer>오전|오후|저녁|아침|새벽|낮)?\s*(?P<h>\d{1,2})\s*"
    r"(?::\s*(?P<mi>\d{2})|시(?!간)\s*(?:(?P<mi2>\d{1,2})\s*분|(?P<half>반))?)"
)
_RANGE_GAP = re.compile(r"^\s*(?:~|∼|–|—|-|부터|에서)\s*$")
_AFTER_SPAN = re.compile(r"\s*(?:까지|부터|에서|에는|에|쯤|경|께|즈음)?")
_TAIL = re.compile(
    r"(?:하기로\s*결정|하기로\s*했음|하기로\s*함|하기로|진행\s*예정|예정입니다|예정이다|예정|진행합니다|진행함|진행|"
    r"해야\s*합니다|해야\s*함|합니다|한다|함|입니다|이다|까지)$"
)
_PARTICLE = re.compile(r"(?<=[가-힣A-Za-z0-9])(?:은|는|을|를|에서|으로|에)$")


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _next_weekday(base: date, wd: int) -> date:
    delta = (wd - base.weekday()) % 7 or 7
    return base + timedelta(days=delta)


def _safe_date(y: int, m: int, d: int) -> Optional[date]:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _add_months(d: date, n: int, day: int) -> Optional[date]:
    idx = d.year * 12 + (d.month - 1) + n
    return _safe_date(idx // 12, idx % 12 + 1, day)


def _resolve(name: str, m: "re.Match", ref: date, base: Optional[date]) -> Optional[Tuple[date, Optional[date]]]:
    """날짜 표현 하나를 (시작일, 끝일 또는 None) 으로 변환"""
    g = m.groupdict()
    anchor = base or ref
    if name == "ymd":
        d = _safe_date(int(g["y"]), int(g["m"]), int(g["d"]))
        return (d, None) if d else None
    if name in ("md_kor", "md_slash"):
        year = anchor.year
        d = _safe_date(year, int(g["m"]), int(g["d"]))
        if d and not base and (d - ref).days < -180:
            d = _safe_date(year + 1, int(g["m"]), int(g["d"]))
        return (d, None) if d else None
    if name == "rel_month_day":
        d = _add_months(ref, 0 if g["rel"] == "이번" else 1, int(g["d"]))
        return (d, None) if d else None
    if name == "rel_week_wd":
        off = {"이번": 0, "다음": 1, "담": 1, "다다음": 2}[g["rel"]]
        return _week_start(ref) + timedelta(days=7 * off + WD[g["wd"]]), None
    if name == "rel_weekend":
        sat = _week_start(ref) + timedelta(days=(7 if g["rel"] != "이번" else 0) + 5)
        return sat, sat + timedelta(days=1)
    if name == "rel_day":
        return ref + timedelta(days={"오늘": 0, "내일": 1, "모레": 2, "글피": 3}[g["w"]]), None
    if name == "after_n":
        n = int(g["n"]) * (7 if g["u"] == "주" else 1)
        return ref + timedelta(days=n), None
    if name == "bare_wd":
        return _next_weekday(anchor, WD[g["wd"]]), None
    if name == "bare_day":
        day = int(g["d"])
        d = _safe_date(anchor.year, anchor.month, day)
        if d and not base and day < ref.day:
            d = _add_months(ref, 1, day)
        return (d, None) if d else None
    return None


def _clock(mer: Optional[str], h: int) -> int:
    if mer in ("오후", "저녁", "낮"):
        return h + 12 if h < 12 else h
    if mer in ("오전", "아침", "새벽"):
        return 0 if h == 12 else h
    return h + 12 if 1 <= h <= 6 else h   # 접두어 없는 '2시'는 오후로 간주


def _find_times(line: str) -> List[Tuple[int, int, str]]:
    out = []
    for m in _TIME_RE.finditer(line):
        h = int(m.group("h"))
        if h > 24:
            continue
        minute = 30 if m.group("half") else int(m.group("mi") or m.group("mi2") or 0)
        if minute > 59:
            continue
        mer = m.group("mer")
        hour = h if m.group("mi") is not None and not mer else _clock(mer, h)
        if hour > 23:
            continue
        out.append((m.start(), m.end(), f"{hour:02d}:{minute:02d}"))
    return out


def _clean_title(line: str, spans: List[Tuple[int, int]]) -> str:
    # 날짜/시간 표현과 그 뒤에 붙은 조사(까지, 부터 ...)를 제거
    pieces, last = [], 0
    for s, e in sorted(spans):
        if s < last:
            continue
        pieces.append(line[last:s])
        tail = _AFTER_SPAN.match(line, e)
        last = tail.end() if tail else e
    pieces.append(line[last:])
    text = re.sub(r"\s+", " ", " ".join(pieces)).strip()
    text = re.sub(r"^[\-\*•·▪>\s]+", "", text)
    text = re.sub(r"(?:^|\s)[~∼\-–—]+(?=\s|$)", " ", text).strip()
    for _ in range(3):
        text = text.strip(" ,.:;·-~")
        new = _TAIL.sub("", text).strip()
        new = _PARTICLE.sub("", new).strip() if len(new) > 2 else new
        if new == text:
            break
        text = new
    return text.strip(" ,.:;·-~")


def _split_lines(text: str) -> List[str]:
    lines = []
    for raw in text.splitlines():
        lines.extend(p.strip() for p in re.split(r"(?<=[.!?。])\s+", raw) if p.strip())
    return lines


def detect_rules(text: str, reference: date, title: Optional[str] = None) -> List[Dict]:
    results = []
    for line in _split_lines(text):
        if re.search(r"매주|매월|매일|격주", line):   # 반복 일정은 아직 지원하지 않음
            continue
        times = _find_times(line)

        # 1) 날짜 표현 수집 (겹치면 앞선/우선순위 높은 패턴만 남김)
        found = []
        for prio, (name, rx) in enumerate(_DATE_PATTERNS):
            for m in rx.finditer(line):
                found.append((m.start(), prio, m.end(), name, m))
        found.sort(key=lambda x: (x[0], x[1]))
        kept, last_end = [], -1
        for start, _prio, end, name, m in found:
            if start >= last_end:
                kept.append((start, end, name, m))
                last_end = end
        # '오늘'은 시간이 함께 적힌 경우에만 일정으로 취급
        kept = [k for k in kept if not (k[2] == "rel_day" and k[3].group("w") == "오늘" and not times)]
        if not kept:
            continue

        # 2) 순서대로 날짜 해석 + 기간("A ~ B", "A부터 B까지") 묶기
        mentions, prev = [], None
        for start, end, name, m in kept:
            resolved = _resolve(name, m, reference, prev)
            if not resolved:
                continue
            mentions.append((start, end, resolved))
            prev = resolved[1] or resolved[0]
        spans = [(s, e) for s, e, _ in mentions]
        spans += [(s, e) for s, e, _ in times]

        i, ranges = 0, []
        while i < len(mentions):
            s1, e1, (d1, d1e) = mentions[i]
            if i + 1 < len(mentions) and _RANGE_GAP.match(line[e1:mentions[i + 1][0]]):
                _s2, _e2, (d2, d2e) = mentions[i + 1]
                end_d = d2e or d2
                ranges.append((d1, end_d if end_d >= d1 else d1))
                i += 2
            else:
                ranges.append((d1, d1e or d1))
                i += 1

        start_t = end_t = None
        if times:
            start_t = times[0][2]
            if len(times) > 1 and _RANGE_GAP.match(line[times[0][1]:times[1][0]]):
                end_t = times[1][2]

        base_title = _clean_title(line, spans) or (title or "일정")
        for d_start, d_end in ranges:
            item = _normalize({
                "title": base_title, "start_date": d_start.isoformat(), "end_date": d_end.isoformat(),
                "start_time": start_t, "end_time": end_t, "source": line,
            })
            if item:
                results.append(item)
    return _dedupe(results)


# ======================================================================
# 진입점
# ======================================================================
async def detect_events(text: str, reference: date, title: Optional[str] = None) -> Tuple[str, Optional[str], List[Dict]]:
    """(engine, note, events) 반환. engine 은 'gemini' | 'claude' | 'rules'."""
    engines = []
    if settings.GEMINI_API_KEY:
        engines.append(("gemini", _detect_gemini))
    if settings.ANTHROPIC_API_KEY:
        engines.append(("claude", _detect_claude))

    note = None
    for name, fn in engines:
        try:
            return name, None, await fn(text, reference, title)
        except Exception as exc:  # 네트워크/키/응답 오류 → 다음 엔진 또는 규칙 기반으로 대체
            # 예외 문자열에 URL 이 들어갈 수 있으므로 종류만 기록
            logger.warning("%s 일정 분석 실패(%s), 다음 방법으로 대체", name, type(exc).__name__)
            note = "AI 호출에 실패해 기본 분석으로 대체했어요."
    if not engines:
        note = "AI 키가 설정되지 않아 기본(규칙 기반) 분석을 사용했어요."
    return "rules", note, detect_rules(text, reference, title)
