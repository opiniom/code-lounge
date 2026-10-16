"""관리자 코드(6자리) 관문.

관리자 페이지는 두 겹으로 지킨다:  ① 관리자 계정으로 로그인  +  ② 6자리 관리자 코드.
 · 코드는 처음에 최고관리자가 직접 정한다 (기본 코드는 없다 → 추측할 수 없다). bcrypt 해시로만 저장한다.
 · 코드를 맞게 입력하면 서버가 짧은 '관리자 확인 토큰'(기본 4시간)을 주고, 모든 /api/admin/* 요청이 이 토큰을 함께 보내야 한다.
 · 코드를 틀리면 횟수가 쌓이고, 5번 틀리면 잠긴다(15분 → 계속 틀리면 30분, 60분 … 최대 6시간). 6자리는 경우의 수가 적으므로 이 잠금이 핵심이다.
 · 코드를 바꾸면 이전에 받은 확인 토큰은 모두 무효가 된다.
 · 코드는 최고관리자만 정하거나 바꿀 수 있다. 잊었다면 서버에서 scripts/reset_admin_code.py 로 지우고 다시 정한다.
"""
import re
import time
from datetime import datetime, timedelta
from typing import Dict, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import SiteSetting, User
from services.auth_service import hash_password, is_super_admin, require_admin_role, verify_password

GATE_HEADER = "X-Admin-Token"
GATE_TTL = timedelta(hours=4)
MAX_FAILS = 5
LOCK_BASE = 15 * 60
LOCK_MAX = 6 * 3600
GATE_MSG = "관리자 코드 확인이 필요해요."
_CODE_RE = re.compile(r"^\d{6}$")
_attempts: Dict[int, dict] = {}        # user_id -> {fails, locks, until}


# ---------------------------------------------------------------- 저장소
async def _get(db: AsyncSession, key: str) -> Optional[str]:
    row = (await db.execute(select(SiteSetting).where(SiteSetting.key == key))).scalar_one_or_none()
    return row.value if row else None


async def _put(db: AsyncSession, key: str, value: Optional[str], by: Optional[int]) -> None:
    row = (await db.execute(select(SiteSetting).where(SiteSetting.key == key))).scalar_one_or_none()
    if row is None:
        db.add(SiteSetting(key=key, value=value, updated_by=by))
    else:
        row.value = value; row.updated_at = datetime.utcnow(); row.updated_by = by


async def code_state(db: AsyncSession):
    """(코드 해시 또는 None, 버전)"""
    h = await _get(db, "admin_code_hash")
    ver = int(await _get(db, "admin_code_ver") or 0)
    return h, ver


def validate_code(code: str) -> str:
    code = (code or "").strip()
    if not _CODE_RE.match(code):
        raise HTTPException(status_code=400, detail="코드는 숫자 6자리여야 해요.")
    if len(set(code)) == 1 or code in ("123456", "234567", "345678", "456789", "567890", "654321", "987654", "012345"):
        raise HTTPException(status_code=400, detail="너무 쉬운 코드예요. 같은 숫자 반복이나 연속된 숫자는 쓸 수 없어요.")
    return code


async def set_code(db: AsyncSession, code: str, by: int) -> int:
    """새 코드를 저장하고 버전을 올린다(이전 확인 토큰 모두 무효). 새 버전을 돌려준다."""
    _, ver = await code_state(db)
    await _put(db, "admin_code_hash", hash_password(code), by)
    await _put(db, "admin_code_ver", str(ver + 1), by)
    _attempts.clear()
    return ver + 1


async def clear_code(db: AsyncSession) -> None:
    ver = int(await _get(db, "admin_code_ver") or 0)
    await _put(db, "admin_code_hash", None, None)
    await _put(db, "admin_code_ver", str(ver + 1), None)


# ---------------------------------------------------------------- 시도 횟수 · 잠금
def lock_left(user_id: int) -> int:
    a = _attempts.get(user_id)
    return max(0, int(a["until"] - time.time())) if a and a.get("until") else 0


def assert_unlocked(user_id: int) -> None:
    left = lock_left(user_id)
    if left:
        raise HTTPException(status_code=429, detail=f"코드를 너무 여러 번 틀려서 잠겼어요. {max(1, (left + 59) // 60)}분 뒤에 다시 시도해 주세요.")


def fail(user_id: int) -> int:
    """틀렸을 때 호출. 남은 시도 횟수(0 이면 방금 잠김)를 돌려준다."""
    a = _attempts.setdefault(user_id, {"fails": 0, "locks": 0, "until": 0})
    a["fails"] += 1
    if a["fails"] >= MAX_FAILS:
        a["fails"] = 0; a["locks"] += 1
        a["until"] = time.time() + min(LOCK_MAX, LOCK_BASE * (2 ** (a["locks"] - 1)))
        return 0
    return MAX_FAILS - a["fails"]


def ok(user_id: int) -> None:
    a = _attempts.get(user_id)
    if a:
        a["fails"] = 0; a["until"] = 0       # 잠금 횟수(locks)는 남겨 둔다: 맞혔다가 틀리기를 반복해도 계속 느려진다


# ---------------------------------------------------------------- 확인 토큰
def issue_token(user: User, ver: int) -> str:
    # 'sub' 를 쓰지 않는다 → 로그인 토큰으로는 절대 통하지 않는다
    return jwt.encode({"typ": "admin_gate", "uid": user.id, "ver": ver, "exp": datetime.utcnow() + GATE_TTL}, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def token_ok(token: Optional[str], user: User, ver: int) -> bool:
    if not token:
        return False
    try:
        p = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return False
    return p.get("typ") == "admin_gate" and p.get("uid") == user.id and p.get("ver") == ver


# ---------------------------------------------------------------- 의존성
async def require_admin(request: Request, user: User = Depends(require_admin_role), db: AsyncSession = Depends(get_db)) -> User:
    """관리 API 의 문지기: 관리자 계정 + 관리자 코드 확인 토큰 (둘 다 서버가 직접 확인)"""
    h, ver = await code_state(db)
    if not h:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 코드가 아직 설정되지 않았어요.")
    if not token_ok(request.headers.get(GATE_HEADER), user, ver):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=GATE_MSG)
    return user


async def require_super(user: User = Depends(require_admin)) -> User:
    if not is_super_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="최고관리자만 할 수 있어요.")
    return user


def check_code(h: str, code: str, user_id: int) -> None:
    """코드를 검사한다: 잠금 확인 → 틀리면 횟수 차감/잠금 → 맞으면 초기화. 틀리면 예외."""
    assert_unlocked(user_id)
    if not _CODE_RE.match((code or "").strip()) or not verify_password(code.strip(), h):
        left = fail(user_id)
        if left == 0:
            raise HTTPException(status_code=429, detail=f"코드를 {MAX_FAILS}번 틀려서 잠겼어요. {max(1, (lock_left(user_id) + 59) // 60)}분 뒤에 다시 시도해 주세요.")
        raise HTTPException(status_code=403, detail=f"관리자 코드가 맞지 않아요. (남은 시도 {left}회)")
    ok(user_id)
