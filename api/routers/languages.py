"""사용자에게 보여 주는 언어 목록 (GET /api/languages) — 로그인 없이 볼 수 있다.

워크스페이스의 '▶ 실행' 옆 버전 선택 박스, 그리고 '지원하지 않는 언어' 안내가 이 목록을 쓴다.
관리자가 공개한 언어 중 서버에 실제로 설치된 것만 나오고, 버전을 고를 수 있는 언어(Java·Node·C#·Go·Rust)는 설치된 버전들이 같이 나온다.
HTML·CSS 는 서버가 아니라 사용자 브라우저에서 실행되므로(미리보기) 항상 'browser' 로 따로 나온다.
"""
from fastapi import APIRouter

from services import lang_registry as reg
from services import sandbox_runner as sb

router = APIRouter(prefix="/api/languages", tags=["Languages"])
BROWSER_LANGS = [{"id": "html", "label": "HTML"}, {"id": "css", "label": "CSS"}]


def public_languages() -> list:
    out = []
    avail = sb.available()
    for lang, label in sb.LABELS.items():
        if not avail.get(lang):
            continue
        rt = reg.runtime_for_lang(lang)
        versions = reg.list_versions(rt) if rt else []
        out.append({"id": lang, "label": label, "runtime": rt, "default": next((v["id"] for v in versions if v["active"]), None),
                    "versions": [{"id": v["id"], "label": v["label"], "active": v["active"]} for v in versions]})
    return out


@router.get("")
async def list_languages():
    return {"languages": public_languages(), "browser": BROWSER_LANGS}
