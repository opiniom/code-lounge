"""관리자 API (/api/admin/*).

모든 엔드포인트는 require_admin 으로 서버에서 직접 권한을 확인한다 (화면에서 메뉴를 숨기는 것은 보안이 아니다).
 · 최고관리자: .env 의 ADMIN_EMAILS 에 있는 이메일 — 운영자 지정/해제, 모든 작업 가능
 · 운영자: 최고관리자가 지정한 계정(User.is_admin) — 사용자 정지, 신고·콘텐츠·크롤러·공지 관리
관리자가 한 일은 전부 AuditLog 에 남는다. 비밀번호·토큰 같은 값은 어떤 응답에도 담지 않는다.
"""
import os
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import engine, get_db
from models import (WithdrawalLog, Announcement, AuditLog, CalendarEvent, ChatMessage, CommunityComment, CommunityPost, CommunityReport,
                    CrawledEvent, EventCrawlRun, MeetingDoc, Notification, Project, ProjectFile, ProjectMember, User)
from services import event_crawler as ec
from services import live
from services import account_service as acct
from services import admin_gate as gate
from services.admin_gate import require_admin, require_super
from services.auth_service import is_admin_user, is_super_admin, require_admin_role, require_super_role

router = APIRouter(prefix="/api/admin", tags=["Admin"])
STARTED_AT = time.time()


# ---------------------------------------------------------------- 관리자 코드 (관문)
class CodeIn(BaseModel):
    code: str = Field(..., max_length=20)


class CodeChangeIn(BaseModel):
    current: str = Field(..., max_length=20)
    new: str = Field(..., max_length=20)


@router.get("/gate/status")
async def gate_status(request: Request, admin: User = Depends(require_admin_role), db: AsyncSession = Depends(get_db)):
    h, ver = await gate.code_state(db)
    return {"code_set": bool(h), "is_super": is_super_admin(admin), "verified": bool(h) and gate.token_ok(request.headers.get(gate.GATE_HEADER), admin, ver),
            "locked_seconds": gate.lock_left(admin.id), "ttl_hours": int(gate.GATE_TTL.total_seconds() // 3600)}


@router.post("/gate/verify")
async def gate_verify(data: CodeIn, admin: User = Depends(require_admin_role), db: AsyncSession = Depends(get_db)):
    h, ver = await gate.code_state(db)
    if not h:
        raise HTTPException(409, "관리자 코드가 아직 설정되지 않았어요. 최고관리자가 먼저 설정해야 해요.")
    was_locked = gate.lock_left(admin.id) > 0
    try:
        gate.check_code(h, data.code, admin.id)
    except HTTPException:
        if not was_locked and gate.lock_left(admin.id) > 0:        # 이번 시도로 잠김 → 기록
            _audit(db, admin, "gate.lock", "user", admin.id, "관리자 코드를 연속으로 틀려 잠김")
            await db.commit()
        raise
    _audit(db, admin, "gate.login", "user", admin.id, "관리자 페이지 접속")
    await db.commit()
    return {"token": gate.issue_token(admin, ver), "expires_in": int(gate.GATE_TTL.total_seconds())}


@router.post("/gate/setup")
async def gate_setup(data: CodeIn, admin: User = Depends(require_super_role), db: AsyncSession = Depends(get_db)):
    """처음 한 번: 최고관리자가 6자리 코드를 정한다"""
    h, _ = await gate.code_state(db)
    if h:
        raise HTTPException(409, "이미 코드가 설정돼 있어요. 바꾸려면 현재 코드가 필요해요.")
    code = gate.validate_code(data.code)
    ver = await gate.set_code(db, code, admin.id)
    _audit(db, admin, "gate.setup", "user", admin.id, "관리자 코드 최초 설정")
    await db.commit()
    return {"token": gate.issue_token(admin, ver), "expires_in": int(gate.GATE_TTL.total_seconds())}


@router.post("/gate/change")
async def gate_change(data: CodeChangeIn, admin: User = Depends(require_super), db: AsyncSession = Depends(get_db)):
    """코드 변경 (최고관리자만, 현재 코드를 다시 입력해야 함). 이전에 받은 모든 확인 토큰이 무효가 된다."""
    h, _ = await gate.code_state(db)
    gate.check_code(h, data.current, admin.id)
    new = gate.validate_code(data.new)
    if new == data.current.strip():
        raise HTTPException(400, "지금 코드와 같아요. 다른 코드를 정해 주세요.")
    ver = await gate.set_code(db, new, admin.id)
    _audit(db, admin, "gate.change", "user", admin.id, "관리자 코드 변경 (다른 접속은 모두 해제)")
    await db.commit()
    return {"token": gate.issue_token(admin, ver), "expires_in": int(gate.GATE_TTL.total_seconds())}


# ---------------------------------------------------------------- 공통
async def _n(db: AsyncSession, stmt) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


def _audit(db: AsyncSession, admin: User, action: str, target_type: Optional[str] = None, target_id: Optional[int] = None, detail: Optional[str] = None) -> None:
    db.add(AuditLog(admin_id=admin.id, admin_name=admin.username or admin.email, action=action, target_type=target_type, target_id=target_id, detail=(detail or "")[:500] or None))


def _page(page: int, size: int):
    page = max(1, page); size = min(max(1, size), 100)
    return page, size, (page - 1) * size


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


def _role(u: User) -> str:
    return "super" if is_super_admin(u) else ("admin" if u.is_admin else "user")


async def _kick(user_id: int) -> None:
    """정지된 사용자의 실시간 연결을 바로 끊는다"""
    for ws in list(live.hub.conns.get(user_id, ())):
        try:
            await ws.close(code=4401)
        except Exception:
            pass


def _user_row(u: User) -> Dict[str, Any]:
    return {"id": u.id, "email": u.email, "username": u.username, "is_active": u.is_active, "role": _role(u),
            "provider": u.oauth_provider, "created_at": _iso(u.created_at), "last_seen_at": _iso(u.last_seen_at),
            "online": live.hub.is_online(u.id), "ban_reason": u.ban_reason, "banned_at": _iso(u.banned_at)}


# ---------------------------------------------------------------- 대시보드
async def _series(db: AsyncSession, col, days: int, *where) -> List[Dict[str, Any]]:
    since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    rows = (await db.execute(select(func.date(col), func.count()).where(col >= since, *where).group_by(func.date(col)))).all()
    by = {str(d): c for d, c in rows}
    return [{"date": str((since + timedelta(days=i)).date()), "count": by.get(str((since + timedelta(days=i)).date()), 0)} for i in range(days)]


@router.get("/overview")
async def overview(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow(); today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    open_reports = (await db.execute(select(CommunityReport.target_type, CommunityReport.target_id).where(CommunityReport.status == "open").distinct())).all()
    return {
        "users": {"total": await _n(db, select(func.count()).select_from(User).where(User.withdrawn_at.is_(None))),
                  "suspended": await _n(db, select(func.count()).select_from(User).where(User.is_active == False, User.withdrawn_at.is_(None))),  # noqa: E712
                  "new_today": await _n(db, select(func.count()).select_from(User).where(User.created_at >= today0, User.withdrawn_at.is_(None))),
                  "new_7d": await _n(db, select(func.count()).select_from(User).where(User.created_at >= now - timedelta(days=7), User.withdrawn_at.is_(None))),
                  "online": len(live.hub.conns),
                  "withdrawn_7d": await _n(db, select(func.count()).select_from(WithdrawalLog))},
        "content": {"projects": await _n(db, select(func.count()).select_from(Project)),
                    "posts": await _n(db, select(func.count()).select_from(CommunityPost).where(CommunityPost.is_deleted == False)),  # noqa: E712
                    "comments": await _n(db, select(func.count()).select_from(CommunityComment).where(CommunityComment.is_deleted == False)),  # noqa: E712
                    "chat": await _n(db, select(func.count()).select_from(ChatMessage)),
                    "files": await _n(db, select(func.count()).select_from(ProjectFile)),
                    "notes": await _n(db, select(func.count()).select_from(MeetingDoc)),
                    "events": await _n(db, select(func.count()).select_from(CrawledEvent))},
        "todo": {"reports": len(open_reports),
                 "crawl_failed": await _n(db, select(func.count()).select_from(EventCrawlRun).where(EventCrawlRun.ok == False, EventCrawlRun.started_at >= now - timedelta(days=1)))},  # noqa: E712
        "series": {"users": await _series(db, User.created_at, 14), "posts": await _series(db, CommunityPost.created_at, 14),
                   "chat": await _series(db, ChatMessage.created_at, 14)},
        "recent_users": [_user_row(u) for u in (await db.execute(select(User).where(User.withdrawn_at.is_(None)).order_by(User.id.desc()).limit(6))).scalars().all()],
        "recent_audit": [_audit_row(a) for a in (await db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(6))).scalars().all()],
    }


# ---------------------------------------------------------------- 사용자
@router.get("/users")
async def list_users(q: str = "", state: str = "all", page: int = 1, size: int = 20,
                     admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    page, size, off = _page(page, size)
    conds = [User.withdrawn_at.is_(None)]          # 탈퇴한 빈 계정은 목록에 보이지 않는다 (탈퇴 기록 화면에서 7일간 확인)
    q = (q or "").strip()
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(User.email).like(like), func.lower(User.username).like(like)))
    if state == "suspended":
        conds.append(User.is_active == False)  # noqa: E712
    elif state == "active":
        conds.append(User.is_active == True)  # noqa: E712
    elif state == "admin":
        conds.append(User.is_admin == True)  # noqa: E712
    total = await _n(db, select(func.count()).select_from(User).where(*conds))
    users = (await db.execute(select(User).where(*conds).order_by(User.id.desc()).limit(size).offset(off))).scalars().all()
    ids = [u.id for u in users]
    posts = dict((await db.execute(select(CommunityPost.user_id, func.count()).where(CommunityPost.user_id.in_(ids), CommunityPost.is_deleted == False).group_by(CommunityPost.user_id))).all()) if ids else {}  # noqa: E712
    owned = dict((await db.execute(select(Project.owner_id, func.count()).where(Project.owner_id.in_(ids)).group_by(Project.owner_id))).all()) if ids else {}
    joined = dict((await db.execute(select(ProjectMember.user_id, func.count()).where(ProjectMember.user_id.in_(ids)).group_by(ProjectMember.user_id))).all()) if ids else {}
    items = []
    for u in users:
        r = _user_row(u); r["posts"] = posts.get(u.id, 0); r["projects"] = owned.get(u.id, 0) + joined.get(u.id, 0)
        items.append(r)
    return {"items": items, "total": total, "page": page, "size": size}


@router.get("/users/{user_id}")
async def user_detail(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    u = (await db.execute(select(User).where(User.id == user_id, User.withdrawn_at.is_(None)))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없어요.")
    owned = (await db.execute(select(Project).where(Project.owner_id == u.id).order_by(Project.id.desc()))).scalars().all()
    member = (await db.execute(select(Project).join(ProjectMember, ProjectMember.project_id == Project.id).where(ProjectMember.user_id == u.id))).scalars().all()
    posts = (await db.execute(select(CommunityPost).where(CommunityPost.user_id == u.id).order_by(CommunityPost.id.desc()).limit(8))).scalars().all()
    reported = await _n(db, select(func.count()).select_from(CommunityReport).join(CommunityPost, (CommunityReport.target_type == "post") & (CommunityPost.id == CommunityReport.target_id)).where(CommunityPost.user_id == u.id))
    logs = (await db.execute(select(AuditLog).where(AuditLog.target_type == "user", AuditLog.target_id == u.id).order_by(AuditLog.id.desc()).limit(8))).scalars().all()
    r = _user_row(u)
    r.update({"projects": [{"id": p.id, "title": p.title, "role": "팀장"} for p in owned] + [{"id": p.id, "title": p.title, "role": "팀원"} for p in member if p.owner_id != u.id],
              "posts": [{"id": p.id, "title": p.title, "category": p.category, "hidden": p.is_hidden, "deleted": p.is_deleted, "created_at": _iso(p.created_at)} for p in posts],
              "reports_received": reported, "audit": [_audit_row(a) for a in logs]})
    return r


class SuspendIn(BaseModel):
    reason: str = Field(default="", max_length=200)


def _guard_target(admin: User, target: User) -> None:
    if target.id == admin.id:
        raise HTTPException(400, "내 계정에는 할 수 없어요.")
    if is_super_admin(target):
        raise HTTPException(403, "최고관리자 계정은 건드릴 수 없어요.")
    if is_admin_user(target) and not is_super_admin(admin):
        raise HTTPException(403, "운영자 계정은 최고관리자만 관리할 수 있어요.")


@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: int, data: SuspendIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    u = (await db.execute(select(User).where(User.id == user_id, User.withdrawn_at.is_(None)))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없어요.")
    _guard_target(admin, u)
    u.is_active = False; u.ban_reason = (data.reason or "").strip()[:200] or None; u.banned_at = datetime.utcnow()
    _audit(db, admin, "user.suspend", "user", u.id, f"{u.email} · {u.ban_reason or '사유 없음'}")
    await db.commit()
    await _kick(u.id)
    return _user_row(u)


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    u = (await db.execute(select(User).where(User.id == user_id, User.withdrawn_at.is_(None)))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없어요.")
    u.is_active = True; u.ban_reason = None; u.banned_at = None
    _audit(db, admin, "user.unsuspend", "user", u.id, u.email)
    await db.commit()
    return _user_row(u)


class RoleIn(BaseModel):
    is_admin: bool


@router.post("/users/{user_id}/role")
async def set_role(user_id: int, data: RoleIn, admin: User = Depends(require_super), db: AsyncSession = Depends(get_db)):
    """운영자 지정/해제 (최고관리자만)"""
    u = (await db.execute(select(User).where(User.id == user_id, User.withdrawn_at.is_(None)))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없어요.")
    if u.id == admin.id or is_super_admin(u):
        raise HTTPException(400, "최고관리자 계정은 바꿀 수 없어요.")
    if data.is_admin and not u.is_active:
        raise HTTPException(400, "정지된 계정은 운영자로 지정할 수 없어요.")
    u.is_admin = bool(data.is_admin)
    _audit(db, admin, "user.admin_on" if u.is_admin else "user.admin_off", "user", u.id, u.email)
    await db.commit()
    return _user_row(u)


# ---------------------------------------------------------------- 탈퇴 기록 · 계정 삭제
@router.get("/withdrawals")
async def list_withdrawals(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """최근 7일 안에 탈퇴한 계정 기록. 7일이 지난 기록은 여기서도 자동으로 지운다."""
    await acct.purge_withdrawal_logs(db)
    now = datetime.utcnow()
    rows = (await db.execute(select(WithdrawalLog).order_by(WithdrawalLog.id.desc()))).scalars().all()
    import json as _json
    out = []
    for r in rows:
        try:
            summ = _json.loads(r.summary or "{}")
        except ValueError:
            summ = {}
        left = max(0, (r.expires_at - now).total_seconds())
        out.append({"id": r.id, "user_id": r.user_id, "email": r.email_masked, "username": r.username, "provider": r.provider, "joined_at": _iso(r.joined_at),
                    "withdrawn_at": _iso(r.withdrawn_at), "expires_at": _iso(r.expires_at), "hours_left": int(left // 3600), "days_left": int((left + 86399) // 86400),
                    "reason": acct.REASONS.get(r.reason or "", None), "reason_text": r.reason_text, "by": r.by, "by_admin": r.by_admin, "summary": summ})
    return {"items": out, "total": len(out), "keep_days": acct.KEEP_DAYS}


class DeleteAccountIn(BaseModel):
    reason: str = Field(default="", max_length=200)


@router.post("/users/{user_id}/delete")
async def delete_account(user_id: int, data: DeleteAccountIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """계정 삭제(탈퇴 처리). 쓰지 않는 '유령 계정'을 정리할 때 쓴다. 본인 탈퇴와 똑같이 처리되고 탈퇴 기록에도 남는다."""
    u = (await db.execute(select(User).where(User.id == user_id, User.withdrawn_at.is_(None)))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없어요.")
    _guard_target(admin, u)
    label = u.email
    summary = await acct.withdraw_user(db, u, "etc", (data.reason or "").strip() or "관리자가 삭제", by="admin", by_admin=admin.username or admin.email)
    _audit(db, admin, "user.delete", "user", user_id, f"{acct.mask_email(label)} · {(data.reason or '').strip() or '사유 없음'}")
    await db.commit()
    from routers.account import after_withdraw
    await after_withdraw(user_id, summary.pop("_notify", []))
    return {"ok": True, "summary": summary}


# ---------------------------------------------------------------- 신고 · 콘텐츠
async def _targets(db: AsyncSession, pairs) -> Dict[tuple, Dict[str, Any]]:
    pids = [i for t, i in pairs if t == "post"]; cids = [i for t, i in pairs if t == "comment"]
    out: Dict[tuple, Dict[str, Any]] = {}
    if pids:
        rows = (await db.execute(select(CommunityPost, User.username).outerjoin(User, User.id == CommunityPost.user_id).where(CommunityPost.id.in_(pids)))).all()
        for p, name in rows:
            out[("post", p.id)] = {"post_id": p.id, "title": p.title, "body": (p.body or "")[:180], "author": name or "운영팀", "author_id": p.user_id,
                                   "category": p.category, "hidden": p.is_hidden, "deleted": p.is_deleted, "pinned": p.is_pinned}
    if cids:
        rows = (await db.execute(select(CommunityComment, User.username).outerjoin(User, User.id == CommunityComment.user_id).where(CommunityComment.id.in_(cids)))).all()
        for c, name in rows:
            out[("comment", c.id)] = {"post_id": c.post_id, "title": "(댓글)", "body": (c.body or "")[:180], "author": name or "알 수 없음", "author_id": c.user_id,
                                      "category": "comment", "hidden": False, "deleted": c.is_deleted, "pinned": False}
    return out


@router.get("/reports")
async def list_reports(status: str = "open", admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    conds = [] if status == "all" else [CommunityReport.status == ("open" if status == "open" else status)]
    rows = (await db.execute(select(CommunityReport).where(*conds).order_by(CommunityReport.id.desc()).limit(600))).scalars().all()
    groups: Dict[tuple, Dict[str, Any]] = {}
    for r in rows:
        g = groups.setdefault((r.target_type, r.target_id), {"target_type": r.target_type, "target_id": r.target_id, "count": 0, "reasons": [], "last_at": _iso(r.created_at), "status": r.status})
        g["count"] += 1
        if r.reason and r.reason not in g["reasons"] and len(g["reasons"]) < 5:
            g["reasons"].append(r.reason)
    info = await _targets(db, list(groups.keys()))
    items = []
    for k, g in groups.items():
        g["target"] = info.get(k)
        items.append(g)
    items.sort(key=lambda g: (-g["count"], g["last_at"] or ""))
    return {"items": items, "total": len(items)}


class ReportAction(BaseModel):
    action: str       # hide | delete | dismiss | restore


@router.post("/reports/{target_type}/{target_id}/resolve")
async def resolve_report(target_type: str, target_id: int, data: ReportAction, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if target_type not in ("post", "comment") or data.action not in ("hide", "delete", "dismiss", "restore"):
        raise HTTPException(400, "잘못된 요청이에요.")
    obj = (await db.execute(select(CommunityPost if target_type == "post" else CommunityComment).where((CommunityPost if target_type == "post" else CommunityComment).id == target_id))).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "대상을 찾을 수 없어요.")
    if data.action == "hide" and target_type == "post":
        obj.is_hidden = True
    elif data.action == "delete":
        obj.is_deleted = True
    elif data.action == "dismiss":
        if target_type == "post":
            obj.is_hidden = False; obj.report_count = 0
    elif data.action == "restore":
        obj.is_deleted = False
        if target_type == "post":
            obj.is_hidden = False
    new_status = "dismissed" if data.action in ("dismiss", "restore") else "resolved"
    now = datetime.utcnow()
    for r in (await db.execute(select(CommunityReport).where(CommunityReport.target_type == target_type, CommunityReport.target_id == target_id, CommunityReport.status == "open"))).scalars().all():
        r.status = new_status; r.handled_by = admin.id; r.handled_at = now
    _audit(db, admin, "report." + data.action, target_type, target_id, getattr(obj, "title", None) or (getattr(obj, "body", "") or "")[:60])
    await db.commit()
    return {"ok": True}


@router.get("/posts")
async def list_posts(q: str = "", state: str = "all", page: int = 1, size: int = 20, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    page, size, off = _page(page, size)
    conds = []
    q = (q or "").strip()
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(CommunityPost.title).like(like), func.lower(CommunityPost.body).like(like)))
    if state == "hidden":
        conds.append(CommunityPost.is_hidden == True)  # noqa: E712
    elif state == "deleted":
        conds.append(CommunityPost.is_deleted == True)  # noqa: E712
    elif state == "pinned":
        conds.append(CommunityPost.is_pinned == True)  # noqa: E712
    elif state == "reported":
        conds.append(CommunityPost.report_count > 0)
    total = await _n(db, select(func.count()).select_from(CommunityPost).where(*conds))
    rows = (await db.execute(select(CommunityPost, User.username).outerjoin(User, User.id == CommunityPost.user_id).where(*conds).order_by(CommunityPost.id.desc()).limit(size).offset(off))).all()
    return {"total": total, "page": page, "size": size, "items": [
        {"id": p.id, "title": p.title, "category": p.category, "author": name or "운영팀", "author_id": p.user_id, "likes": p.like_count, "comments": p.comment_count,
         "reports": p.report_count, "hidden": p.is_hidden, "deleted": p.is_deleted, "pinned": p.is_pinned, "created_at": _iso(p.created_at)} for p, name in rows]}


class PostAction(BaseModel):
    action: str       # pin | unpin | hide | unhide | delete | restore


@router.post("/posts/{post_id}/action")
async def post_action(post_id: int, data: PostAction, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(CommunityPost).where(CommunityPost.id == post_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "글을 찾을 수 없어요.")
    a = data.action
    if a == "pin": p.is_pinned = True
    elif a == "unpin": p.is_pinned = False
    elif a == "hide": p.is_hidden = True
    elif a == "unhide": p.is_hidden = False
    elif a == "delete": p.is_deleted = True
    elif a == "restore": p.is_deleted = False
    else: raise HTTPException(400, "잘못된 요청이에요.")
    _audit(db, admin, "post." + a, "post", p.id, p.title)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 프로젝트 (보기만)
@router.get("/projects")
async def list_projects(q: str = "", page: int = 1, size: int = 20, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    page, size, off = _page(page, size)
    conds = []
    q = (q or "").strip()
    if q:
        conds.append(func.lower(Project.title).like(f"%{q.lower()}%"))
    total = await _n(db, select(func.count()).select_from(Project).where(*conds))
    rows = (await db.execute(select(Project, User.username, User.email).outerjoin(User, User.id == Project.owner_id).where(*conds).order_by(Project.id.desc()).limit(size).offset(off))).all()
    ids = [p.id for p, _, _ in rows]
    mem = dict((await db.execute(select(ProjectMember.project_id, func.count()).where(ProjectMember.project_id.in_(ids)).group_by(ProjectMember.project_id))).all()) if ids else {}
    files = dict((await db.execute(select(ProjectFile.project_id, func.count()).where(ProjectFile.project_id.in_(ids)).group_by(ProjectFile.project_id))).all()) if ids else {}
    chat_rows = (await db.execute(select(ChatMessage.project_id, func.count(), func.max(ChatMessage.created_at)).where(ChatMessage.project_id.in_(ids)).group_by(ChatMessage.project_id))).all() if ids else []
    chat = {pid: (c, last) for pid, c, last in chat_rows}
    return {"total": total, "page": page, "size": size, "items": [
        {"id": p.id, "title": p.title, "owner": name, "owner_email": email, "members": 1 + mem.get(p.id, 0), "files": files.get(p.id, 0),
         "chat": chat.get(p.id, (0, None))[0], "last_chat_at": _iso(chat.get(p.id, (0, None))[1]), "created_at": _iso(p.created_at)} for p, name, email in rows]}


# ---------------------------------------------------------------- 이벤트 크롤러
@router.get("/crawler")
async def crawler_info(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    runs = (await db.execute(select(EventCrawlRun).order_by(EventCrawlRun.id.desc()).limit(40))).scalars().all()
    by_source = (await db.execute(select(CrawledEvent.source, func.count()).group_by(CrawledEvent.source))).all()
    return {"running": ec.is_running(), "enabled": settings.EVENT_CRAWL_ENABLED, "interval_hours": settings.EVENT_CRAWL_INTERVAL_HOURS,
            "sources": [{"key": ec.SOURCE_ALIAS.get(n, n), "label": ec.SOURCE_LABELS.get(ec.SOURCE_ALIAS.get(n, n), n)} for n in ec.enabled_sources()],
            "total_events": await _n(db, select(func.count()).select_from(CrawledEvent)), "by_source": {s: c for s, c in by_source},
            "runs": [{"id": r.id, "source": r.source, "label": ec.SOURCE_LABELS.get(r.source, r.source), "started_at": _iso(r.started_at), "finished_at": _iso(r.finished_at), "ok": r.ok,
                      "found": r.found, "added": r.added, "updated": r.updated, "error": r.error, "trigger": r.trigger} for r in runs]}


@router.post("/crawler/run")
async def crawler_run(background: BackgroundTasks, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """지금 바로 수집 (일반 사용자의 5분 제한과 별개로, 이미 돌고 있을 때만 막는다)"""
    if ec.is_running():
        return {"started": False, "message": "이미 수집하고 있어요."}
    background.add_task(ec.refresh_all, "manual")
    _audit(db, admin, "crawler.run", "crawler", None, "수동 실행")
    await db.commit()
    return {"started": True, "message": "수집을 시작했어요. 잠시 뒤 새로고침하면 결과가 보여요."}


@router.get("/events")
async def list_events(q: str = "", page: int = 1, size: int = 20, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    page, size, off = _page(page, size)
    conds = []
    q = (q or "").strip()
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(CrawledEvent.title).like(like), func.lower(func.coalesce(CrawledEvent.host, "")).like(like)))
    total = await _n(db, select(func.count()).select_from(CrawledEvent).where(*conds))
    rows = (await db.execute(select(CrawledEvent).where(*conds).order_by(CrawledEvent.id.desc()).limit(size).offset(off))).scalars().all()
    return {"total": total, "page": page, "size": size, "items": [
        {"id": e.id, "title": e.title, "category": e.category, "host": e.host, "source": e.source, "deadline": e.deadline, "url": e.url, "created_at": _iso(e.created_at)} for e in rows]}


@router.delete("/events/{event_id}")
async def delete_event(event_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ev = (await db.execute(select(CrawledEvent).where(CrawledEvent.id == event_id))).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "이벤트를 찾을 수 없어요.")
    _audit(db, admin, "event.delete", "event", ev.id, ev.title)
    await db.execute(delete(CrawledEvent).where(CrawledEvent.id == event_id))
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 공지
class AnnounceIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    message: str = Field(..., min_length=1, max_length=1000)
    link: Optional[str] = Field(default=None, max_length=300)


@router.get("/announcements")
async def list_announcements(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Announcement, User.username).outerjoin(User, User.id == Announcement.created_by).order_by(Announcement.id.desc()).limit(50))).all()
    return {"items": [{"id": a.id, "title": a.title, "message": a.message, "link": a.link, "sent_count": a.sent_count, "by": name, "created_at": _iso(a.created_at)} for a, name in rows]}


@router.post("/announcements")
async def send_announcement(data: AnnounceIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """모든(정지되지 않은) 사용자에게 알림으로 공지를 보낸다. 접속 중인 사람에게는 바로 팝업으로 뜬다."""
    title = data.title.strip(); message = data.message.strip()
    if not title or not message:
        raise HTTPException(400, "제목과 내용을 입력해 주세요.")
    link = (data.link or "").strip() or None
    if link and not (link.startswith("/app") or link.startswith("https://")):
        raise HTTPException(400, "링크는 /app/… 또는 https:// 주소만 쓸 수 있어요.")
    ids = (await db.execute(select(User.id).where(User.is_active == True))).scalars().all()  # noqa: E712
    for uid in ids:
        db.add(Notification(user_id=uid, title="📢 " + title, message=message, category="notice", link=link))
    ann = Announcement(title=title, message=message, link=link, sent_count=len(ids), created_by=admin.id)
    db.add(ann)
    _audit(db, admin, "announce.send", "announcement", None, f"{title} → {len(ids)}명")
    await db.commit()
    return {"ok": True, "sent_count": len(ids)}


# ---------------------------------------------------------------- 감사 로그 · 시스템
def _audit_row(a: AuditLog) -> Dict[str, Any]:
    return {"id": a.id, "admin": a.admin_name, "admin_id": a.admin_id, "action": a.action, "target_type": a.target_type, "target_id": a.target_id, "detail": a.detail, "created_at": _iso(a.created_at)}


@router.get("/audit")
async def audit_list(q: str = "", page: int = 1, size: int = 30, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    page, size, off = _page(page, size)
    conds = []
    q = (q or "").strip()
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(AuditLog.action).like(like), func.lower(func.coalesce(AuditLog.detail, "")).like(like), func.lower(AuditLog.admin_name).like(like)))
    total = await _n(db, select(func.count()).select_from(AuditLog).where(*conds))
    rows = (await db.execute(select(AuditLog).where(*conds).order_by(AuditLog.id.desc()).limit(size).offset(off))).scalars().all()
    return {"total": total, "page": page, "size": size, "items": [_audit_row(a) for a in rows]}


@router.get("/system")
async def system_info(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    db_size = None
    if engine.dialect.name == "sqlite":
        try:
            db_size = os.path.getsize(engine.url.database)
        except Exception:
            pass
    tables = {}
    for label, model in (("users", User), ("projects", Project), ("chat_messages", ChatMessage), ("project_files", ProjectFile), ("meeting_docs", MeetingDoc),
                         ("calendar_events", CalendarEvent), ("notifications", Notification), ("community_posts", CommunityPost), ("crawled_events", CrawledEvent), ("audit_logs", AuditLog)):
        tables[label] = await _n(db, select(func.count()).select_from(model))
    return {"uptime_seconds": int(time.time() - STARTED_AT), "db_engine": engine.dialect.name, "db_size_bytes": db_size,
            "ws_users": len(live.hub.conns), "ws_connections": sum(len(s) for s in live.hub.conns.values()),
            "flags": {"PUBLIC_MODE": settings.PUBLIC_MODE, "EVENT_CRAWL_ENABLED": settings.EVENT_CRAWL_ENABLED, "ALLOW_DEV_LOGIN": settings.ALLOW_DEV_LOGIN,
                      "ADMIN_EMAILS_SET": bool((settings.ADMIN_EMAILS or "").strip())},
            "tables": tables, "you": {"id": admin.id, "role": _role(admin)}}
