"""사용자 접속 기록 (누가 · 언제 · 어느 IP 로).

· 로그인할 때마다 'login', 로그인한 채로 새 IP 에서 처음 접속하면 'visit' 로 남긴다 (같은 사용자+IP 는 30분에 한 번만).
· IP 는 프록시 뒤에서도 실제 접속자 주소를 쓴다 (services/client_ip.py). 원본 User-Agent 는 저장하지 않고 '기기 · 브라우저' 요약만 남긴다.
· 기록하다 실패해도 사용자의 요청은 절대 막지 않는다. ACCESS_LOG_DAYS 가 지나면 서버가 자동으로 지운다 (services/account_service.purge_loop).
"""
import asyncio
import logging
import re
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple

from fastapi import Request
from sqlalchemy import delete

from services.client_ip import client_ip

logger = logging.getLogger("access")
VISIT_EVERY = 1800                                 # 같은 사용자+IP 는 30분에 한 번만
_seen: Dict[Tuple[int, str], float] = {}
_tasks: set = set()


def device_of(ua: Optional[str]) -> Optional[str]:
    """User-Agent 에서 '기기 · 브라우저'만 뽑는다 (예: 'iOS · Safari', 'Windows · Chrome')"""
    ua = ua or ""
    if not ua:
        return None
    if re.search(r"iPhone|iPad|iPod", ua):
        os_ = "iOS"
    elif "Android" in ua:
        os_ = "Android"
    elif "Windows" in ua:
        os_ = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os_ = "macOS"
    elif "CrOS" in ua:
        os_ = "ChromeOS"
    elif "Linux" in ua:
        os_ = "Linux"
    else:
        os_ = "기타"
    if re.search(r"Edg(e|A|iOS)?/", ua):
        br = "Edge"
    elif re.search(r"OPR/|Opera", ua):
        br = "Opera"
    elif re.search(r"SamsungBrowser", ua):
        br = "삼성 인터넷"
    elif re.search(r"Firefox|FxiOS", ua):
        br = "Firefox"
    elif re.search(r"Chrome|CriOS", ua):
        br = "Chrome"
    elif "Safari" in ua:
        br = "Safari"
    else:
        br = "기타"
    return f"{os_} · {br}"


async def _write(user_id: int, username: str, ip: str, event: str, client: str, device: Optional[str]) -> None:
    from database import async_session_maker
    from models import AccessLog
    try:
        async with async_session_maker() as db:
            db.add(AccessLog(user_id=user_id, username=(username or "")[:100] or "—", ip=ip[:64], event=event, client=client, device=device))
            await db.commit()
    except Exception:
        logger.warning("접속 기록 저장 실패", exc_info=True)


def log_access(request: Optional[Request], user, event: str = "visit") -> None:
    """접속 기록을 남긴다 (기다리지 않고 뒤에서 저장). 요청을 느리게 하거나 실패시키지 않는다."""
    try:
        if request is None or user is None or not getattr(user, "id", None):
            return
        ip = client_ip(request)
        if not ip:
            return
        now = time.time()
        key = (user.id, ip)
        if event == "visit":
            last = _seen.get(key)
            if last and now - last < VISIT_EVERY:
                return
        _seen[key] = now
        if len(_seen) > 20000:                       # 오래된 것부터 정리 (메모리가 커지지 않게)
            for k in [k for k, t in _seen.items() if now - t > VISIT_EVERY][:10000]:
                _seen.pop(k, None)
        client = "app" if (request.headers.get("x-client-mode") or "").lower() == "app" else "web"
        name = getattr(user, "username", None) or getattr(user, "email", None) or "—"
        t = asyncio.get_running_loop().create_task(_write(user.id, name, ip, event, client, device_of(request.headers.get("user-agent"))))
        _tasks.add(t)
        t.add_done_callback(_tasks.discard)
    except Exception:
        logger.warning("접속 기록 준비 실패", exc_info=True)


async def purge_access_logs(db) -> int:
    from config import settings
    from models import AccessLog
    cutoff = datetime.utcnow() - timedelta(days=max(1, int(settings.ACCESS_LOG_DAYS or 90)))
    res = await db.execute(delete(AccessLog).where(AccessLog.created_at < cutoff))
    await db.commit()
    return res.rowcount or 0
