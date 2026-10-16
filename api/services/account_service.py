"""회원 탈퇴 처리.

배경: 이 서비스의 DB(SQLite)는 외래키 연쇄 삭제(ondelete CASCADE)를 실제로 실행하지 않는다.
그래서 계정 행만 지우면 연결된 데이터가 '주인 없는 행'으로 남고(유령 데이터), 같은 번호가 새 사용자에게 다시 쓰이면
탈퇴한 사람의 옛 로그인 토큰이 남의 계정으로 통할 수도 있다. 그래서:

  · 연결된 데이터를 우리가 직접 하나씩 정리한다 (아래 withdraw_user).
  · 계정 행은 지우지 않고 '개인정보를 모두 비운 빈 계정'(번호 보존용)으로 남긴다. 로그인은 영구히 불가능하다.
  · 탈퇴 기록(마스킹한 이메일·이름·시각·처리 내용)은 7일만 보관하고 자동으로 지운다.

팀 프로젝트 처리:
  · 팀장인 프로젝트에 다른 팀원이 없으면 → 프로젝트와 파일·채팅·회의록·일정을 모두 삭제
  · 다른 팀원이 있으면 → 팀장을 넘긴다 (부팀장 우선, 없으면 먼저 참여한 팀원). 프로젝트 데이터는 팀에 남고, 내가 쓴 기록은 '탈퇴한 사용자' 로 표시된다.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import (CalendarEvent, CallRoom, ChatMessage, CommunityApplication, CommunityBookmark, CommunityComment, CommunityLike, CommunityPost,
                    CommunityReport, Follow, MeetingDoc, Notification, PortfolioEntry, Project, ProjectFile, ProjectInvitation, ProjectMember,
                    Submission, User, UserProfile, WithdrawalLog)

logger = logging.getLogger("account")
KEEP_DAYS = 7
CONFIRM_TEXT = "탈퇴합니다"
GONE_NAME = "탈퇴한 사용자"
REASONS = {"rare": "자주 쓰지 않아요", "feature": "원하는 기능이 없어요", "bug": "오류나 불편이 많아요", "privacy": "개인정보가 걱정돼요",
           "newacct": "새 계정으로 다시 가입할래요", "etc": "기타"}


def mask_email(email: Optional[str]) -> str:
    if not email:
        return "-"
    if email.endswith("@guest.sync.local"):
        return "게스트 계정"
    name, _, dom = email.partition("@")
    if len(name) <= 2:
        masked = name[:1] + "*"
    else:
        masked = name[0] + "***" + name[-1]
    return f"{masked}@{dom}" if dom else masked


def tombstone_email(user_id: int) -> str:
    return f"withdrawn-{user_id}@deleted.invalid"


# ---------------------------------------------------------------- 처리 계획 (미리보기와 실제 처리가 같은 계산을 쓴다)
async def _owned_plan(db: AsyncSession, user: User) -> List[Dict[str, Any]]:
    projects = (await db.execute(select(Project).where(Project.owner_id == user.id).order_by(Project.id))).scalars().all()
    plan = []
    for p in projects:
        rows = (await db.execute(
            select(ProjectMember, User).join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == p.id, ProjectMember.user_id != user.id, User.withdrawn_at.is_(None))
            .order_by(ProjectMember.created_at, ProjectMember.id))).all()
        leaders = [r for r in rows if r[0].role == "leader"]
        pick = (leaders or rows)[0] if rows else None
        plan.append({"project": p, "members": len(rows), "successor": pick[1] if pick else None})
    return plan


async def _count(db: AsyncSession, stmt) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


async def withdraw_preview(db: AsyncSession, user: User, blocked: Optional[str] = None) -> Dict[str, Any]:
    plan = await _owned_plan(db, user)
    member_of = await _count(db, select(func.count()).select_from(ProjectMember).join(Project, Project.id == ProjectMember.project_id).where(ProjectMember.user_id == user.id, Project.owner_id != user.id))
    return {
        "blocked": blocked,
        "provider": user.oauth_provider,
        "owned": [{"id": x["project"].id, "title": x["project"].title, "members": x["members"],
                   "action": "transfer" if x["successor"] else "delete", "successor": x["successor"].username if x["successor"] else None} for x in plan],
        "member_of": member_of,
        "posts": await _count(db, select(func.count()).select_from(CommunityPost).where(CommunityPost.user_id == user.id, CommunityPost.is_deleted == False)),  # noqa: E712
        "comments": await _count(db, select(func.count()).select_from(CommunityComment).where(CommunityComment.user_id == user.id, CommunityComment.is_deleted == False)),  # noqa: E712
        "runs": await _count(db, select(func.count()).select_from(Submission).where(Submission.user_id == user.id)),
        "following": await _count(db, select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)),
        "followers": await _count(db, select(func.count()).select_from(Follow).where(Follow.followee_id == user.id)),
        "keep_days": KEEP_DAYS, "confirm_text": CONFIRM_TEXT, "reasons": [{"code": k, "label": v} for k, v in REASONS.items()],
    }


# ---------------------------------------------------------------- 프로젝트 통째로 삭제
async def _delete_project(db: AsyncSession, pid: int) -> int:
    files = await _count(db, select(func.count()).select_from(ProjectFile).where(ProjectFile.project_id == pid))
    for model in (ProjectFile, ChatMessage, CalendarEvent, MeetingDoc, CallRoom, ProjectInvitation, ProjectMember, Notification, PortfolioEntry):
        await db.execute(delete(model).where(model.project_id == pid))
    await db.execute(update(CommunityPost).where(CommunityPost.project_id == pid).values(project_id=None))
    await db.execute(delete(Project).where(Project.id == pid))
    return files


# ---------------------------------------------------------------- 본 처리
async def withdraw_user(db: AsyncSession, user: User, reason: Optional[str] = None, reason_text: Optional[str] = None,
                        by: str = "self", by_admin: Optional[str] = None) -> Dict[str, Any]:
    """계정을 탈퇴 처리한다. 커밋은 호출한 쪽에서 한다. 처리 내용 요약(dict)을 돌려준다."""
    uid = user.id
    now = datetime.utcnow()
    summary: Dict[str, Any] = {"projects_deleted": 0, "projects_transferred": 0, "files_deleted": 0, "left_projects": 0, "posts": 0, "comments": 0, "runs": 0}

    # 화면을 새로 고쳐 줘야 할 사람들(같은 프로젝트 팀원·팔로우 관계)을 지우기 전에 모아 둔다
    pids = set((await db.execute(select(ProjectMember.project_id).where(ProjectMember.user_id == uid))).scalars().all())
    pids |= set((await db.execute(select(Project.id).where(Project.owner_id == uid))).scalars().all())
    notify = set()
    if pids:
        notify |= set((await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id.in_(pids)))).scalars().all())
        notify |= set((await db.execute(select(Project.owner_id).where(Project.id.in_(pids)))).scalars().all())
    notify |= set((await db.execute(select(Follow.followee_id).where(Follow.follower_id == uid))).scalars().all())
    notify |= set((await db.execute(select(Follow.follower_id).where(Follow.followee_id == uid))).scalars().all())
    notify.discard(uid)

    # 1) 내가 팀장인 프로젝트: 혼자면 삭제, 팀원이 있으면 팀장 이전
    for item in await _owned_plan(db, user):
        p, succ = item["project"], item["successor"]
        if succ is None:
            summary["files_deleted"] += await _delete_project(db, p.id)
            summary["projects_deleted"] += 1
        else:
            p.owner_id = succ.id
            await db.execute(delete(ProjectMember).where(ProjectMember.project_id == p.id, ProjectMember.user_id.in_([succ.id, uid])))   # 팀장은 멤버 행이 없다
            db.add(Notification(user_id=succ.id, project_id=p.id, title="팀장이 바뀌었어요", message=f"이전 팀장이 탈퇴해서 '{p.title}' 프로젝트의 팀장을 맡게 됐어요.", category="project"))
            summary["projects_transferred"] += 1

    # 2) 다른 사람 프로젝트에서는 나가기 (채팅·파일·회의록 기록은 팀에 남고 작성자는 '탈퇴한 사용자'로 보인다)
    summary["left_projects"] = await _count(db, select(func.count()).select_from(ProjectMember).where(ProjectMember.user_id == uid))
    await db.execute(delete(ProjectMember).where(ProjectMember.user_id == uid))
    await db.execute(delete(ProjectInvitation).where(ProjectInvitation.created_by == uid))     # 내가 만든 초대 링크는 더 이상 쓸 수 없게

    # 3) 커뮤니티: 글·댓글 내용을 비우고 삭제 처리, 내가 누른 좋아요·북마크 집계 되돌리기
    for like in (await db.execute(select(CommunityLike).where(CommunityLike.user_id == uid))).scalars().all():
        if like.target_type == "post":
            await db.execute(update(CommunityPost).where(CommunityPost.id == like.target_id, CommunityPost.like_count > 0).values(like_count=CommunityPost.like_count - 1))
        elif like.target_type == "comment":
            await db.execute(update(CommunityComment).where(CommunityComment.id == like.target_id, CommunityComment.like_count > 0).values(like_count=CommunityComment.like_count - 1))
    for bm in (await db.execute(select(CommunityBookmark).where(CommunityBookmark.user_id == uid))).scalars().all():
        await db.execute(update(CommunityPost).where(CommunityPost.id == bm.post_id, CommunityPost.bookmark_count > 0).values(bookmark_count=CommunityPost.bookmark_count - 1))
    for model in (CommunityLike, CommunityBookmark, CommunityApplication, CommunityReport):
        await db.execute(delete(model).where(model.user_id == uid))
    posts = (await db.execute(select(CommunityPost).where(CommunityPost.user_id == uid, CommunityPost.is_deleted == False))).scalars().all()  # noqa: E712
    for p in posts:
        p.title = "(삭제된 글)"; p.body = ""; p.tags = None; p.recruit_roles = None; p.is_deleted = True; p.is_pinned = False
    summary["posts"] = len(posts)
    comments = (await db.execute(select(CommunityComment).where(CommunityComment.user_id == uid, CommunityComment.is_deleted == False))).scalars().all()  # noqa: E712
    per_post: Dict[int, int] = {}
    for c in comments:
        c.body = ""; c.is_deleted = True
        per_post[c.post_id] = per_post.get(c.post_id, 0) + 1
    for post_id, n in per_post.items():
        await db.execute(update(CommunityPost).where(CommunityPost.id == post_id).values(comment_count=case((CommunityPost.comment_count > n, CommunityPost.comment_count - n), else_=0)))
    summary["comments"] = len(comments)

    # 4) 개인 데이터
    summary["runs"] = await _count(db, select(func.count()).select_from(Submission).where(Submission.user_id == uid))
    await db.execute(delete(Submission).where(Submission.user_id == uid))
    await db.execute(delete(Notification).where(Notification.user_id == uid))
    await db.execute(delete(Follow).where(or_(Follow.follower_id == uid, Follow.followee_id == uid)))
    await db.execute(delete(UserProfile).where(UserProfile.user_id == uid))
    await db.execute(delete(PortfolioEntry).where(PortfolioEntry.user_id == uid))
    await db.execute(delete(CalendarEvent).where(CalendarEvent.user_id == uid, CalendarEvent.kind == "private"))
    await db.execute(delete(MeetingDoc).where(MeetingDoc.user_id == uid, MeetingDoc.project_id.is_(None)))   # 개인 회의록

    # 5) 탈퇴 기록 (7일 보관) — 계정을 비우기 전에 원래 정보로 남긴다
    db.add(WithdrawalLog(user_id=uid, email_masked=mask_email(user.email), username=(user.username or "")[:100], provider=user.oauth_provider,
                         joined_at=user.created_at, withdrawn_at=now, expires_at=now + timedelta(days=KEEP_DAYS),
                         reason=reason if reason in REASONS else None, reason_text=(reason_text or "").strip()[:200] or None,
                         by=by, by_admin=by_admin, summary=json.dumps(summary, ensure_ascii=False)))

    # 6) 계정을 '빈 계정'으로 (행은 남긴다: 번호가 다시 쓰이면 옛 토큰이 남의 계정으로 통할 수 있다)
    user.email = tombstone_email(uid)
    user.username = GONE_NAME
    user.hashed_password = None
    user.oauth_provider = None
    user.oauth_id = None
    user.ai_name = None
    user.is_active = False
    user.is_admin = False
    user.ban_reason = None
    user.banned_at = None
    user.last_seen_at = None
    user.withdrawn_at = now
    await db.flush()
    summary["_notify"] = sorted(notify)
    return summary


# ---------------------------------------------------------------- 7일이 지난 탈퇴 기록 삭제
async def purge_withdrawal_logs(db: AsyncSession) -> int:
    res = await db.execute(delete(WithdrawalLog).where(WithdrawalLog.expires_at <= datetime.utcnow()))
    await db.commit()
    return res.rowcount or 0


async def purge_loop() -> None:
    """서버가 켜져 있는 동안 한 시간마다 만료된 탈퇴 기록을 지운다 (관리자 페이지를 열지 않아도 7일 뒤엔 사라진다)"""
    from database import async_session_maker
    while True:
        try:
            async with async_session_maker() as db:
                n = await purge_withdrawal_logs(db)
                if n:
                    logger.info("만료된 탈퇴 기록 %d건 삭제", n)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("탈퇴 기록 정리 실패")
        await asyncio.sleep(3600)
