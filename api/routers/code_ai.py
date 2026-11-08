"""코딩 입문자를 위한 AI 에러 설명 API.  POST /api/ai/explain-error
실행이 실패한 뒤 '🤖 AI에게 물어보기' 를 눌렀을 때만 부른다(비용 관리). 로그인한 사용자만, 한 사용자당 1시간에 20번까지."""
import hashlib
import time
from collections import OrderedDict, deque
from typing import Deque, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from models import User
from services import code_ai
from services import sandbox_runner as sb
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/ai", tags=["CodeAI"])
PER_HOUR = 20
_hits: Dict[int, Deque[float]] = {}
_cache: "OrderedDict[str, dict]" = OrderedDict()           # 같은 코드·같은 에러는 다시 묻지 않고 돌려준다 (비용 절약)


class ExplainIn(BaseModel):
    language: str = Field("python", max_length=30)
    code: str = Field("", max_length=200_000)
    error: str = Field(..., min_length=1, max_length=20_000)
    file_name: Optional[str] = Field(None, max_length=200)


class ExplainOut(BaseModel):
    summary: str
    error_line: Optional[int] = None
    cause_line: Optional[int] = None
    line_note: str = ""
    explanation: str
    steps: List[str] = []
    fixed_code: str = ""
    concept: str = ""
    engine: str = "rules"
    known: bool = True
    ai_failed: bool = False


@router.post("/explain-error", response_model=ExplainOut)
async def explain_error(body: ExplainIn, user: User = Depends(get_current_user)):
    now = time.monotonic()
    q = _hits.setdefault(user.id, deque())
    while q and now - q[0] > 3600:
        q.popleft()
    raw = (body.language or "").lower().strip()
    lang = sb.ALIASES.get(raw, raw)
    key = hashlib.sha1(("%s\0%s\0%s" % (lang, body.code, body.error)).encode("utf-8", "replace")).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    if len(q) >= PER_HOUR:
        raise HTTPException(status_code=429, detail=f"AI 에러 설명은 1시간에 {PER_HOUR}번까지 쓸 수 있어요. 잠시 뒤에 다시 눌러 주세요.")
    q.append(now)
    res = await code_ai.explain(lang, body.code, body.error, body.file_name or "")
    res.setdefault("ai_failed", False)
    _cache[key] = res
    while len(_cache) > 200:
        _cache.popitem(last=False)
    return res
