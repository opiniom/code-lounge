"""회의록·채팅·음성에서 AI 가 일정을 읽기 전에 '내용을 정리'하는 규칙 (AI 호출 없음).

해결하는 문제
- 쓰다가 취소·삭제한 항목이 계속 일정으로 잡힘:  "햄버거 땡땡 금요일까지" → (취소선 ~~…~~ / "햄버거 땡땡 취소") → 다시 "햄버거 땡땡 월요일까지"
- 같은 말을 두 번 하거나(채팅·음성 모두) 같은 일을 표현만 바꿔 다시 적으면 일정이 중복으로 생김
- "햄버거 땡땡 다음 주 월요일로 변경" 처럼 정정한 경우 앞의 날짜가 그대로 남음

원칙: 확실한 취소·정정 표현이 있을 때만 지운다. (모호하면 지우지 않는다 — 일정이 사라지는 것이 더 나쁘다)
"""
import re
from typing import Callable, Dict, List, Optional, Sequence, Set

# ----------------------------------------------------------------------
# 취소선(~~글~~) · 취소 표현
# ----------------------------------------------------------------------
_STRIKE = re.compile(r"~~(.+?)~~", re.S)

# 줄 끝이 '취소' 류로 끝나거나, 취소를 뜻하는 문구가 있으면 '취소하는 말'이다.
# ('삭제 기능 구현 금요일까지' 처럼 삭제가 할 일의 이름인 줄은 지우지 않도록 '동사 꼴'만 본다)
_RETRACT_END = re.compile(
    r"(?:취소|철회|보류|드롭)\s*(?:함|합니다|했\w*|할게\w*|하자|하기로\w*|됐\w*|됨|되었\w*|예정\w*|해\s*줘\w*|해\s*주세요|해요|합시다|요)?\s*[.!)\]~ㅠㅜ]*$")
_RETRACT_PHRASE = re.compile(
    r"없던\s*(?:걸로|거로|일로|일이|일)|없는\s*걸로|하지\s*않기로|안\s*하기로|안\s*하는\s*걸로|"
    r"(?:지워|지우|삭제|빼)\s*(?:줘|주세요|자|기로|할게\w*|함|했\w*|고|버려\w*)|(?:삭제|제외)\s*(?:함|했\w*|됐\w*|됨|하기로\w*|할게\w*)")
_RETRACT_LEAD = re.compile(r"^\s*(?:[\(\[（]\s*(?:취소|철회|삭제|보류)\s*[\)\]）]|(?:취소|철회|삭제|보류)\s*[:：])\s*")
_CANCEL_STRIP = re.compile(
    r"[\(\[（]\s*(?:취소|철회|삭제|보류)\s*[\)\]）]|(?:취소|철회|삭제|보류|드롭|제외|지워|지우|빼)\w*|없던\s*\S*|없는\s*걸로|하지\s*않기로|안\s*하기로|안\s*하는\s*걸로")

# 정정: 앞에서 말한 일의 날짜를 바꾼다는 신호
_CORRECT = re.compile(r"변경|정정|연기|미루|미뤄|앞당|조정|대신|말고|아니(?:고|라|야|다|,)|로\s*바꿔|로\s*바꿈|→|=>|수정(?:함|했|하기로|합니다)")

# ----------------------------------------------------------------------
# 낱말 비교 (같은 일인지 판단)
# ----------------------------------------------------------------------
_DATEISH = re.compile(
    r"\d+\s*(?:월|일|시|분|주|시간)\S*|\d+[/.:]\d+\S*|[월화수목금토일]요일\S*|오전|오후|저녁|아침|새벽|"
    r"오늘|내일|모레|글피|이번|다음|다다음|담|주말|월말|말일|까지|부터|마감|제출|예정")
_STOP = {"그거", "이거", "저거", "방금", "아까", "다시", "아니", "정말", "일정", "하기", "해야", "해줘", "해주세요", "합니다", "완료", "진행",
         "있음", "없음", "그리고", "그래서", "그럼", "우리", "저희", "제가", "내가", "하는", "하고", "해서", "하면", "할게", "할게요", "하겠", "같이"}
_PARTICLE_END = re.compile(r"(?:은|는|이|가|을|를|도|만|에|의|로|으로|와|과|랑|께|한테)$")


def tokens(text: str) -> Set[str]:
    t = _CANCEL_STRIP.sub(" ", text or "")
    t = _DATEISH.sub(" ", t)
    t = re.sub(r"[^0-9A-Za-z가-힣\s]", " ", t)
    out: Set[str] = set()
    for w in t.split():
        if len(w) > 2:
            w = _PARTICLE_END.sub("", w) or w
        if len(w) >= 2 and w not in _STOP:
            out.add(w.lower())
    return out


def title_key(title: str) -> str:
    """제목 비교용: 공백·기호를 지운 것"""
    return re.sub(r"[^0-9A-Za-z가-힣]", "", (title or "")).lower()


def same_task(a: str, b: str) -> bool:
    """두 제목이 '같은 일'을 가리키는지: 글자가 같거나, 핵심 낱말이 거의 같을 때"""
    ka, kb = title_key(a), title_key(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    ta, tb = tokens(a), tokens(b)
    if len(ta) >= 2 and len(tb) >= 2:
        return len(ta & tb) / len(ta | tb) >= 0.75
    return False


# ----------------------------------------------------------------------
# 취소선 · 취소 표현 처리
# ----------------------------------------------------------------------
def strip_struck(text: str) -> str:
    """~~취소선~~ 으로 지운 글은 없는 것으로 친다"""
    return _STRIKE.sub(" ", text or "")


def is_retraction(line: str) -> bool:
    s = (line or "").strip()
    return bool(s) and bool(_RETRACT_LEAD.match(s) or _RETRACT_PHRASE.search(s) or _RETRACT_END.search(s))


def _subject_tokens(line: str) -> Set[str]:
    return tokens(_RETRACT_LEAD.sub(" ", line or ""))


def kept_indexes(lines: Sequence[str]) -> List[int]:
    """줄(또는 대화) 목록에서 '취소된 것'과 '취소하는 말'을 뺀, 남은 줄의 번호.
    - '햄버거 땡땡 취소' → 앞에 있던 '햄버거 땡땡 …' 줄을 지운다
    - '아 그거 취소' (대상 없음) → 바로 앞 줄 하나를 지운다
    - 취소 뒤에 다시 적은 줄은 살아 있다"""
    alive: List[int] = []
    toks: Dict[int, Set[str]] = {}
    for i, line in enumerate(lines):
        if is_retraction(line):
            subj = _subject_tokens(line)
            if subj:
                alive = [j for j in alive if len(subj & toks[j]) / len(subj) < 0.5]
            elif alive:
                alive.pop()
            continue
        toks[i] = tokens(line)
        alive.append(i)
    return alive


def clean_lines(lines: Sequence[str]) -> List[str]:
    """취소선 글을 지우고, 취소된 줄을 걸러낸 줄 목록"""
    lines = [strip_struck(l).strip() for l in lines]
    lines = [l for l in lines if l]
    return [lines[i] for i in kept_indexes(lines)]


def clean_with_dropped(lines: Sequence[str]):
    """(남은 줄, 취소돼서 빠진 줄) — 작성 화면에서 'AI 가 이 줄은 취소된 것으로 봤어요'를 보여 주는 데 쓴다"""
    raw = [l.strip() for l in lines if l and l.strip()]
    struck = [m.group(1).strip() for l in raw for m in _STRIKE.finditer(l)]
    cleaned = [strip_struck(l).strip() for l in raw]
    cleaned = [l for l in cleaned if l]
    keep = set(kept_indexes(cleaned))
    dropped = struck + [cleaned[i] for i in range(len(cleaned)) if i not in keep]
    return [cleaned[i] for i in sorted(keep)], dropped


def clean_text(text: str) -> str:
    return "\n".join(clean_lines((text or "").splitlines()))


# ----------------------------------------------------------------------
# 같은 말을 되풀이한 것 (음성 인식이 문장을 두 번 내놓는 경우 · 채팅에 같은 말을 또 붙여넣은 경우)
# ----------------------------------------------------------------------
def collapse_repeats(text: str) -> str:
    """'햄버거 땡땡 금요일까지 햄버거 땡땡 금요일까지' → '햄버거 땡땡 금요일까지'.
    바로 이어서 똑같이 반복된 말(3낱말 이상, 또는 8글자 이상)만 한 번으로 줄인다. ('아니 아니' 같은 짧은 반복은 그대로 둔다)"""
    words = (text or "").split()
    changed = True
    while changed and len(words) >= 2:
        changed = False
        n = len(words)
        for size in range(n // 2, 0, -1):
            for i in range(0, n - 2 * size + 1):
                a, b = words[i:i + size], words[i + size:i + 2 * size]
                if [w.lower() for w in a] == [w.lower() for w in b] and (size >= 3 or len(" ".join(a)) >= 8):
                    words = words[:i + size] + words[i + 2 * size:]
                    changed = True
                    break
            if changed:
                break
    return " ".join(words)


# ----------------------------------------------------------------------
# 찾아낸 일정 정리: 중복 · 정정
# ----------------------------------------------------------------------
def _dkey(e: dict):
    return (e.get("start_date"), e.get("end_date"))


def finalize_events(events: List[dict]) -> List[dict]:
    """일정 후보를 글에 나온 순서대로 받아서
    1) 같은 일을 같은 날짜로 두 번 적은 것은 하나로 (시간이 적힌 쪽을 남긴다)
    2) 같은 일인데 날짜가 다르고, 뒤의 문장이 '변경·연기·정정' 같은 정정 표현이면 뒤의 것만 남긴다
    (정정 표현 없이 같은 이름이 다른 날짜에 또 나오면 별개의 일정일 수 있어 둘 다 둔다 — 예: 매주 정기 회의)"""
    out: List[dict] = []
    for e in events:
        nxt: List[dict] = []
        skip_new = False
        for old in out:
            if not same_task(old["title"], e["title"]):
                nxt.append(old)
            elif _dkey(old) == _dkey(e):                         # 같은 일 · 같은 날짜 → 중복: 더 자세한 쪽 하나만
                better = (e.get("start_time") and not old.get("start_time")) or (
                    e.get("start_time") == old.get("start_time") and len(e["title"]) > len(old["title"]))
                nxt.append(e if better else old)
                skip_new = True
            elif _CORRECT.search(e.get("source") or ""):         # 같은 일 · 다른 날짜 + 정정 표현 → 앞의 것은 버린다
                continue
            else:
                nxt.append(old)
        out = nxt
        if not skip_new:
            out.append(e)
    return out


def order_by_source(events: List[dict], text: str) -> List[dict]:
    """AI 가 돌려준 일정을 '글에 나온 순서'로 맞춘다 (뒤에 말한 것이 앞의 것을 정정했는지 알려면 순서가 필요하다)"""
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]

    def pos(e: dict) -> int:
        src = (e.get("source") or "").strip()
        if not src:
            return 10 ** 6
        for i, l in enumerate(lines):
            if src in l or l in src:
                return i
        return 10 ** 6
    ranked = sorted(enumerate(events), key=lambda p: (pos(p[1]), p[0]))
    return [e for _, e in ranked]
