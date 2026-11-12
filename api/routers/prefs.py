"""내 설정 동기화: 웹사이트·설치한 앱(PWA)·다른 기기에서 같은 설정을 쓰게 서버에 보관한다.

- 저장하는 것: 홈 위젯(보이기·순서·크기) · 홈에서 고른 프로젝트 · 캘린더 보기 설정 · 저장한 공모전 · 테마 · 프로젝트별 마지막 파일
- 저장하지 않는 것(기기마다 달라야 하는 것): 화면 크기 배율 · 움직임 · 효과음 · 내 PC 실행기 · 미리보기 크기
- 키마다 '바꾼 시각(t)'이 더 늦은 쪽이 이긴다. 정해진 키만, 크기 제한 안에서만 받는다.
"""
import json
import re
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, UserPref
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/prefs", tags=["Prefs"])

MAX_VALUE_BYTES = 24_000
MAX_TOTAL_BYTES = 80_000
FUTURE_SLACK_MS = 5 * 60 * 1000        # 기기 시계가 많이 앞서 있어도 '미래 시각'으로 영원히 이기지 못하게


_KEY_ACTIONS = {"run", "debug", "stop", "memo"}
_KEY_RE = re.compile(r"^((Ctrl|Alt|Shift)\+)*(F([1-9]|1[0-2])|[A-Z0-9]|Enter|Space|Tab|↑|↓|←|→|[,./;'\[\]\\\-=`])$")


def _keys_ok(v: Any) -> bool:
    """워크스페이스 단축키: 바꾼 동작만 {동작: [키, …]} (동작당 최대 3개, 같은 키를 두 동작에 쓰지 않는다)"""
    if not isinstance(v, dict) or not set(v) <= _KEY_ACTIONS:
        return False
    seen = set()
    for lst in v.values():
        if not isinstance(lst, list) or len(lst) > 3:
            return False
        for k in lst:
            if not isinstance(k, str) or len(k) > 24 or not _KEY_RE.match(k) or k in seen:
                return False
            seen.add(k)
    return True


def _is_str_dict(v: Any, limit: int) -> bool:
    return isinstance(v, dict) and len(v) <= limit and all(isinstance(k, str) and len(k) <= 600 for k in v)


# 키 → 값 검사
CHECKS = {
    "home": lambda v: isinstance(v, dict) and set(v) <= {"show", "order", "wide"}
    and all(isinstance(x, list) and len(x) <= 40 and all(isinstance(i, str) and len(i) <= 40 for i in x) for x in (v.get("show", []), v.get("order", [])))
    and _is_str_dict(v.get("wide", {}), 40),
    "homeproj": lambda v: isinstance(v, str) and len(v) <= 40,
    "evtbm": lambda v: _is_str_dict(v, 800),
    "cal": lambda v: isinstance(v, dict) and set(v) <= {"hidden", "colors", "selected"} and _is_str_dict(v.get("hidden", {}), 200)
    and _is_str_dict(v.get("colors", {}), 200) and isinstance(v.get("selected", "all"), str),
    "theme": lambda v: v in ("light", "dark", "system"),
    "chatseen": lambda v: _is_str_dict(v, 200) and all(isinstance(x, int) and not isinstance(x, bool) and 0 <= x < 10 ** 12 for x in v.values()),
    "wslast": lambda v: _is_str_dict(v, 200) and all(isinstance(x, str) and len(x) <= 300 for x in v.values()),
    "keys": lambda v: _keys_ok(v),
}


class PrefItem(BaseModel):
    v: Any = None
    t: int


class PrefsPut(BaseModel):
    items: Dict[str, PrefItem]


def _load(row) -> Dict[str, dict]:
    try:
        d = json.loads(row.data) if row and row.data else {}
    except ValueError:
        d = {}
    return d if isinstance(d, dict) else {}


@router.get("")
async def get_prefs(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(UserPref).where(UserPref.user_id == current_user.id))).scalar_one_or_none()
    return _load(row)


@router.put("")
async def put_prefs(data: PrefsPut, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """받은 키마다 서버에 있는 것보다 '더 늦게 바꾼 것'일 때만 저장하고, 합쳐진 전체를 돌려준다."""
    if len(data.items) > len(CHECKS):
        raise HTTPException(status_code=400, detail="알 수 없는 설정이에요.")
    row = (await db.execute(select(UserPref).where(UserPref.user_id == current_user.id))).scalar_one_or_none()
    cur = _load(row)
    now_ms = int(time.time() * 1000)
    changed = False
    for key, it in data.items.items():
        check = CHECKS.get(key)
        if check is None:
            raise HTTPException(status_code=400, detail=f"알 수 없는 설정이에요: {key[:30]}")
        try:
            ok = bool(check(it.v))
        except Exception:
            ok = False
        if not ok or len(json.dumps(it.v, ensure_ascii=False)) > MAX_VALUE_BYTES:
            raise HTTPException(status_code=400, detail=f"설정 값이 올바르지 않아요: {key}")
        t = min(max(it.t, 0), now_ms + FUTURE_SLACK_MS)
        old = cur.get(key)
        if old and isinstance(old, dict) and int(old.get("t", 0)) >= t:
            continue
        cur[key] = {"v": it.v, "t": t}
        changed = True
    if changed:
        raw = json.dumps(cur, ensure_ascii=False)
        if len(raw) > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=413, detail="설정이 너무 커요.")
        if row is None:
            db.add(UserPref(user_id=current_user.id, data=raw))
        else:
            row.data = raw
        await db.commit()
    return cur
