"""음성 받아쓰기 API(/api/ai/transcribe) 테스트 — 서버·DB·외부 AI 없이(가짜 AI) 실행. 실행: .venv/bin/python tests/test_voice_api.py (프로젝트 루트에서)
소리 형식·크기 검사, 로그인 필요, 1시간 40번 제한, AI 키 없음, AI 실패, 받아 적은 글 다듬기를 확인한다."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from config import settings
from routers import voice as vr
from services import voice_ai
from services.auth_service import get_current_user

R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))

class U:  # 가짜 로그인 사용자
    def __init__(self, i, ai=None): self.id, self.ai_name = i, ai

app = FastAPI(); app.include_router(vr.router)
cur = {"u": U(1)}
app.dependency_overrides[get_current_user] = lambda: cur["u"]
c = TestClient(app)
AUDIO = b"\x1aE\xdf\xa3" + b"0" * 4000
calls = []
async def fake_ok(body):
    calls.append(body)
    return {"candidates": [{"content": {"parts": [{"text": ' "두레야 내일 오후 3시에 회의 잡아줘" \n'}]}}]}
async def fake_fail(body): raise RuntimeError("boom")

settings.GEMINI_API_KEY = "test-key"; voice_ai._gemini_generate = fake_ok
r = c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/webm;codecs=opus"})
chk("정상: 받아 적은 글이 돌아온다(따옴표·공백 정리)", r.status_code == 200 and r.json()["text"] == "두레야 내일 오후 3시에 회의 잡아줘", r.text)
part = calls[-1]["contents"][0]["parts"]
chk("AI 에 소리(base64)와 '받아쓰기만' 안내가 간다", part[1]["inlineData"]["mimeType"] == "audio/webm" and "받아 적기만" in part[0]["text"] and "두레" in part[0]["text"])
cur["u"] = U(2, "미니"); c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})
chk("내가 정한 AI 이름이 안내에 들어간다", "미니" in calls[-1]["contents"][0]["parts"][0]["text"]); cur["u"] = U(1)
r = c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "text/plain"}); chk("소리가 아닌 형식은 415", r.status_code == 415, r.text)
r = c.post("/api/ai/transcribe", content=b"x" * 100, headers={"content-type": "audio/webm"}); chk("너무 짧은 소리는 400", r.status_code == 400, r.text)
r = c.post("/api/ai/transcribe", content=b"x" * (voice_ai.MAX_BYTES + 10), headers={"content-type": "audio/webm"}); chk("너무 긴 소리는 413", r.status_code == 413, r.status_code)
voice_ai._gemini_generate = fake_fail
r = c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/webm"}); chk("AI 가 실패하면 502 + 쉬운 안내(내부 오류는 안 보임)", r.status_code == 502 and "boom" not in r.text, r.text)
settings.GEMINI_API_KEY = ""
r = c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/webm"}); chk("AI 키가 없으면 503 + 안내", r.status_code == 503 and "키보드" in r.text, r.text)
settings.GEMINI_API_KEY = "test-key"; voice_ai._gemini_generate = fake_ok
cur["u"] = U(9); vr._hits.clear(); ok = [c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/webm"}).status_code for _ in range(vr.PER_HOUR + 2)]
chk("1시간 40번을 넘으면 429", ok[:vr.PER_HOUR] == [200] * vr.PER_HOUR and ok[vr.PER_HOUR:] == [429, 429], ok[-3:])
cur["u"] = U(10); r = c.post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/webm"}); chk("제한은 사용자별(다른 사람은 영향 없음)", r.status_code == 200)
# 로그인 필요: 인증 의존성을 되돌려 보면 401/403
app.dependency_overrides.clear(); r = TestClient(app).post("/api/ai/transcribe", content=AUDIO, headers={"content-type": "audio/webm"}); chk("로그인 없이는 거부", r.status_code in (401, 403), r.status_code)
chk("긴 글은 500자로 자른다", len(voice_ai._clean_text("가" * 900)) == 500)
bad = [x for x in R if not x[1]]
for n, ok_, extra in R: print(("PASS " if ok_ else "FAIL ") + n + ("" if ok_ else f"   ← {str(extra)[:200]}"))
print(f"\n{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
