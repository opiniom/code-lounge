"""음성 받아쓰기 API.  POST /api/ai/transcribe  (본문 = 녹음된 소리 그대로, Content-Type: audio/webm 등)
응답 {text}. 로그인한 사용자만, 1시간에 40번까지. 화면(frontend/js/pages/voice.js)이 브라우저 음성 인식을 못 쓸 때만 부른다."""
import time
from collections import deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from models import User
from services import voice_ai
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/ai", tags=["Voice"])
PER_HOUR = 40
_hits: Dict[int, Deque[float]] = {}


class TranscribeOut(BaseModel):
    text: str = ""


@router.post("/transcribe", response_model=TranscribeOut)
async def transcribe(request: Request, user: User = Depends(get_current_user)):
    now = time.monotonic()
    q = _hits.setdefault(user.id, deque())
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= PER_HOUR:
        raise HTTPException(status_code=429, detail=f"음성 입력은 1시간에 {PER_HOUR}번까지 쓸 수 있어요. 잠시 뒤에 다시 해 주세요.")
    try:
        if int(request.headers.get("content-length") or 0) > voice_ai.MAX_BYTES + 1024:
            raise HTTPException(status_code=413, detail="소리가 너무 길어요. 한 번에 1분 이내로 말해 주세요.")
    except ValueError:
        pass
    audio = await request.body()
    q.append(now)
    try:
        text = await voice_ai.transcribe(audio, request.headers.get("content-type", ""), ai_name=(user.ai_name or "두레"))
    except voice_ai.VoiceError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    return {"text": text}
