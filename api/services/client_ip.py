"""접속자의 실제 IP 주소 (감사 로그용).

서비스는 Caddy(리버스 프록시) 뒤에서 돌아서 서버가 직접 보는 주소는 프록시(내부 주소)다.
프록시가 붙여 주는 헤더(CF-Connecting-IP · X-Forwarded-For)는 **요청이 내부 프록시에서 왔을 때만** 믿는다.
(앱 포트에 누가 직접 접속해서 헤더를 꾸며 보내는 경우에는 헤더를 무시하고 보이는 주소를 그대로 쓴다)
"""
import ipaddress
from contextvars import ContextVar
from typing import Optional

from fastapi import Request

CLIENT_IP: ContextVar[Optional[str]] = ContextVar("client_ip", default=None)


def _clean(raw: Optional[str]) -> Optional[str]:
    v = (raw or "").strip().strip("[]")
    if not v:
        return None
    if v.count(":") == 1 and "." in v:          # '1.2.3.4:5678' → 포트 떼기
        v = v.rsplit(":", 1)[0]
    try:
        return str(ipaddress.ip_address(v))
    except ValueError:
        return None


def _internal(host: Optional[str]) -> bool:
    try:
        a = ipaddress.ip_address((host or "").strip())
    except ValueError:
        return False
    return a.is_private or a.is_loopback or a.is_link_local


def client_ip(request: Request) -> Optional[str]:
    peer = request.client.host if request.client else None
    if _internal(peer):                                   # 내부 프록시를 거쳐 왔다 → 프록시가 알려 준 실제 주소를 쓴다
        cf = _clean(request.headers.get("cf-connecting-ip"))
        if cf:
            return cf
        xff = request.headers.get("x-forwarded-for", "")
        for part in xff.split(","):                       # 맨 앞이 처음 접속한 사람
            ip = _clean(part)
            if ip:
                return ip
    return _clean(peer)


async def bind_client_ip(request: Request) -> None:
    """관리자 API 의 모든 요청에서 접속 주소를 기록해 둔다 (감사 로그가 읽는다). async 라서 같은 요청 안에서 값이 이어진다."""
    CLIENT_IP.set(client_ip(request))
