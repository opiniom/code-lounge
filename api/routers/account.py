"""내 계정 (/api/account): 회원 탈퇴.
탈퇴는 되돌릴 수 없으므로 서버가 직접 한 번 더 확인한다: 약관 동의 두 가지 + 확인 문구 입력.
최고관리자(ADMIN_EMAILS) 계정은 서버 설정과 묶여 있어서 먼저 설정에서 빼야 탈퇴할 수 있다."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services import account_service as acct
from services import live
from services.auth_service import get_current_user, is_super_admin

router = APIRouter(prefix="/api/account", tags=["Account"])

SUPER_BLOCK = "최고관리자 계정은 탈퇴할 수 없어요. 서버 설정(ADMIN_EMAILS)에서 이 이메일을 먼저 뺀 뒤에 탈퇴해 주세요."


class WithdrawIn(BaseModel):
    agree_terms: bool = False
    agree_data: bool = False
    confirm_text: str = Field(default="", max_length=40)
    reason: Optional[str] = Field(default=None, max_length=20)
    reason_text: Optional[str] = Field(default=None, max_length=200)


@router.get("/withdraw/preview")
async def withdraw_preview(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """탈퇴하면 무엇이 어떻게 되는지 미리 보여준다 (아직 아무것도 바뀌지 않음)"""
    return await acct.withdraw_preview(db, user, SUPER_BLOCK if is_super_admin(user) else None)


async def after_withdraw(user_id: int, notify) -> None:
    """탈퇴한 사람의 접속을 끊고, 같은 팀·팔로우 관계였던 사람들 화면을 새로고침하도록 알린다"""
    for ws in list(live.hub.conns.get(user_id, ())):
        try:
            await ws.close(code=4401)
        except Exception:
            pass
    live.hub.conns.pop(user_id, None)
    try:
        await live.clear_ws_presence(user_id, acct.GONE_NAME)
    except Exception:
        pass
    others = [n for n in notify if live.hub.is_online(n)]
    if others:
        await live.hub.send(others, {"t": "projects"})
        await live.hub.send(others, {"t": "follow"})


@router.post("/withdraw")
async def withdraw(data: WithdrawIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if is_super_admin(user):
        raise HTTPException(status_code=403, detail=SUPER_BLOCK)
    if not (data.agree_terms and data.agree_data):
        raise HTTPException(status_code=400, detail="탈퇴 안내와 데이터 삭제 내용에 모두 동의해 주세요.")
    if data.confirm_text.strip() != acct.CONFIRM_TEXT:
        raise HTTPException(status_code=400, detail=f"확인 문구 '{acct.CONFIRM_TEXT}' 를 정확히 입력해 주세요.")
    uid = user.id
    summary = await acct.withdraw_user(db, user, data.reason, data.reason_text, by="self")
    await acct.purge_withdrawal_logs(db)       # commit 포함
    notify = summary.pop("_notify", [])
    await after_withdraw(uid, notify)
    return {"ok": True, "summary": summary, "keep_days": acct.KEEP_DAYS}
