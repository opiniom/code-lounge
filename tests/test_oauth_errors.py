"""소셜 로그인(구글·네이버) 실패 처리 테스트 — 실제 네이버·구글에는 접속하지 않고, 제공자의 응답을 흉내 내서 확인한다.
실행: .venv/bin/python tests/test_oauth_errors.py (프로젝트 루트에서)
확인하는 것: 제공자가 거부하면 ① 화면에 원인 코드가 가고(social_error=…&reason=…) ② 서버 로그에 남고 ③ 토큰·비밀값은 새 나가지 않는다."""
import asyncio, logging, os, sys, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
from routers import auth

class Resp:
    def __init__(self, status, data): self.status_code, self._d = status, data
    def json(self):
        if isinstance(self._d, Exception): raise self._d
        return self._d
def fake_client(script):
    """script: {(method, url 일부): Resp}"""
    class C:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def _go(self, m, url, **k):
            for (mm, part), r in script.items():
                if mm == m and part in url: return r
            raise AssertionError(f"예상하지 못한 요청 {m} {url}")
        async def post(self, url, **k): return await self._go("POST", url, **k)
        async def get(self, url, **k): return await self._go("GET", url, **k)
    return C

R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
logs = []
class H(logging.Handler):
    def emit(self, rec): logs.append(rec.getMessage())
logging.getLogger("oauth").addHandler(H()); logging.getLogger("oauth").setLevel(logging.INFO)
def parse(resp):
    loc = resp.headers["location"]; q = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query); return loc, {k: v[0] for k, v in q.items()}
async def naver(script):
    auth.httpx.AsyncClient = fake_client(script)
    return parse(await auth.naver_callback(code="c", state="s", error=None, db=None))
async def google(script):
    auth.httpx.AsyncClient = fake_client(script)
    return parse(await auth.google_callback(code="c", error=None, db=None))

async def main():
    # 네이버: 토큰 단계에서 200 인데 오류를 담아 보내는 경우 (예전에는 'Bearer None' 으로 프로필을 불러 profile_failed 로 보였다)
    loc, q = await naver({("POST", "nid.naver.com/oauth2.0/token"): Resp(200, {"error": "invalid_request", "error_description": "no valid data in session"})})
    chk("네이버: 토큰 단계 오류(200+error)는 token_failed 로, 이유와 함께", q.get("social_error") == "naver_token_failed" and "no valid data" in q.get("reason", ""), q)
    # 네이버: 프로필 401 (앱이 '개발 중'이고 등록된 멤버가 아닐 때 흔히 나오는 경우)
    ok_tok = Resp(200, {"access_token": "SECRET-TOKEN-123"})
    loc, q = await naver({("POST", "nid.naver.com/oauth2.0/token"): ok_tok, ("GET", "openapi.naver.com/v1/nid/me"): Resp(401, {"resultcode": "024", "message": "Authentication failed (인증에 실패하였습니다.)"})})
    chk("네이버: 프로필 401 → profile_failed + 네이버가 준 이유(024)", q.get("social_error") == "naver_profile_failed" and "024" in q.get("reason", "") and "401" in q.get("reason", ""), q)
    chk("토큰 값은 화면 주소에도 서버 로그에도 새 나가지 않는다", "SECRET-TOKEN-123" not in loc and not any("SECRET-TOKEN-123" in m for m in logs), logs[-2:])
    loc, q = await naver({("POST", "nid.naver.com/oauth2.0/token"): ok_tok, ("GET", "openapi.naver.com/v1/nid/me"): Resp(200, {"resultcode": "024", "message": "Authentication failed"})})
    chk("네이버: 200 이어도 resultcode 가 00 이 아니면 실패로 처리", q.get("social_error") == "naver_profile_failed" and "024" in q.get("reason", ""), q)
    loc, q = await naver({("POST", "nid.naver.com/oauth2.0/token"): Resp(500, ValueError("not json"))})
    chk("네이버: 응답이 JSON 이 아니어도 죽지 않고 http 코드를 알려 준다", q.get("social_error") == "naver_token_failed" and "500" in q.get("reason", ""), q)
    # 구글
    loc, q = await google({("POST", "oauth2.googleapis.com/token"): Resp(400, {"error": "invalid_grant", "error_description": "Bad Request"})})
    chk("구글: 토큰 거부 → google_token_failed + 이유", q.get("social_error") == "google_token_failed" and "invalid_grant" in q.get("reason", ""), q)
    loc, q = await google({("POST", "oauth2.googleapis.com/token"): Resp(200, {"access_token": "G-SECRET"}), ("GET", "googleapis.com/oauth2/v3/userinfo"): Resp(401, {"error": "invalid_token"})})
    chk("구글: 사용자 정보 거부 → google_profile_failed", q.get("social_error") == "google_profile_failed" and "G-SECRET" not in loc, q)
    loc, q = await google({("POST", "oauth2.googleapis.com/token"): Resp(200, {"access_token": "G-SECRET"}), ("GET", "googleapis.com/oauth2/v3/userinfo"): Resp(200, {"sub": "1", "name": "x"})})
    chk("구글: 이메일이 없으면 오류로 알려 준다 (예전에는 서버 오류로 죽었다)", q.get("social_error") == "google_no_email", q)
    chk("실패는 서버 로그(oauth)에 남는다", any("naver login failed at profile_failed" in m for m in logs) and any("google login failed" in m for m in logs), logs[:3])
    # 취소/거부(제공자가 error 를 붙여 돌려보냄)
    r = await auth.google_callback(code=None, error="access_denied", db=None)
    chk("구글: 허용 안 된 사용자(access_denied)는 그 코드로 안내", "social_error=access_denied" in r.headers["location"])
asyncio.run(main())
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
