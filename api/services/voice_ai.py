"""음성 받아쓰기 (AI 에이전트를 말로 부르기).

브라우저의 음성 인식(Web Speech)을 못 쓰는 곳(아이폰 홈 화면 앱, 파이어폭스 등)에서는 화면이 녹음한 짧은 소리를 이리로 보내고,
여기서 Gemini 로 '들린 말'만 받아 적어 돌려준다. 받아 적은 글은 화면에서 채팅 입력칸에 들어가고, 그 뒤는 글로 쓴 것과 똑같이 처리된다
("두레야 …"로 부르면 AI 가 일정·회의록 등을 처리).

· 소리는 저장하지 않는다 (요청이 끝나면 메모리에서 사라진다).
· 로그인한 사용자만, 한 사용자당 1시간에 40번, 한 번에 최대 3MB(약 1분 이내).
"""
import base64
import logging
import re
from typing import Optional

from config import settings
from services.schedule_ai import _gemini_generate

logger = logging.getLogger(__name__)
MAX_BYTES = 3 * 1024 * 1024
MIN_BYTES = 600
ALLOWED = {"audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/flac"}
_PROMPT = (
    "이 소리는 한국어 팀 협업 앱에서 사용자가 AI 비서(이름: {name})에게 말로 시킨 내용이에요. "
    "들리는 말을 그대로 한국어 문장으로 받아 적기만 하세요. 설명·따옴표·번역·덧붙이는 말 없이 사용자가 말한 문장만 한 줄로 쓰세요. "
    "숫자와 날짜·시간은 읽기 쉽게 숫자로 적으세요(예: '내일 오후 3시'). 말이 없거나 알아들을 수 없으면 빈 글자만 돌려주세요."
)


class VoiceError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


def clean_mime(raw: Optional[str]) -> str:
    return (raw or "").split(";")[0].strip().lower()


def _clean_text(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"^[\"'“”‘’`「『]+|[\"'“”‘’`」』]+$", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    return t[:500]


async def transcribe(audio: bytes, mime: str, ai_name: str = "두레") -> str:
    if not settings.GEMINI_API_KEY:
        raise VoiceError(503, "음성 인식 서버가 아직 설정되지 않았어요. 키보드로 입력하거나 브라우저의 음성 입력(키보드 마이크)을 써 주세요.")
    m = clean_mime(mime)
    if m not in ALLOWED:
        raise VoiceError(415, "지원하지 않는 소리 형식이에요.")
    if len(audio) < MIN_BYTES:
        raise VoiceError(400, "소리가 너무 짧아요. 다시 말해 주세요.")
    if len(audio) > MAX_BYTES:
        raise VoiceError(413, "소리가 너무 길어요. 한 번에 1분 이내로 말해 주세요.")
    body = {
        "contents": [{"role": "user", "parts": [{"text": _PROMPT.format(name=ai_name or "두레")}, {"inlineData": {"mimeType": m, "data": base64.b64encode(audio).decode("ascii")}}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 300, "thinkingConfig": {"thinkingBudget": 0}},
    }
    try:
        data = await _gemini_generate(body)
        parts = data["candidates"][0]["content"]["parts"]
        return _clean_text("".join(p.get("text", "") for p in parts))
    except Exception as exc:
        logger.warning("음성 받아쓰기 실패(%s)", type(exc).__name__)
        raise VoiceError(502, "음성을 글로 바꾸지 못했어요. 잠시 뒤에 다시 말해 주세요.")
