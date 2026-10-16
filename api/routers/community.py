"""커뮤니티 API: 질문 · 팀원 모집 · 프로젝트 자랑 · 정보·노하우 · 자유.

다른 개발자 커뮤니티(OKKY, DEV, GeekNews, 디스콰이엇, 인프런)의 구조를 비교해 가져온 것
- 용도별 분류 + 최신/인기/댓글 많은 순, 태그, 검색 (OKKY·DEV)
- 질문은 답변 채택 (Q&A 사이트의 표준)
- 팀원 모집은 일반 글과 분리해 모집 상태·역할·인원·마감을 보여주고, 지원 → 수락하면 곧바로 프로젝트 팀원이 된다 (이 서비스만의 연결)
- 공모전·해커톤 이벤트에서 바로 '팀원 구하기' 글을 만들 수 있다
읽기는 누구나, 쓰기·반응은 로그인한 사용자만. 본문은 서버에 일반 텍스트로만 저장하고 화면에서 안전하게 그린다.
"""
import json
import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    CommunityApplication, CommunityBookmark, CommunityComment, CommunityLike, CommunityPost, CommunityReport,
    CrawledEvent, Notification, Project, ProjectMember, User,
)
from services.access import project_users
from services.auth_service import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/community", tags=["Community"])

CATEGORIES = {
    "question": "질문", "recruit": "팀원 모집", "showcase": "프로젝트 자랑", "share": "정보·노하우", "free": "자유",
}
HIDE_AFTER_REPORTS = 5            # 서로 다른 사용자 신고가 이만큼 쌓이면 목록에서 가린다
LIMITS = {"post_per_day": 10, "comment_per_hour": 40, "apply_per_day": 20, "report_per_day": 20}
_TAG_RE = re.compile(r"^[0-9A-Za-z가-힣+#._\-]{1,20}$")
_URL_RE = re.compile(r"https?://", re.I)


# ---------------------------------------------------------------- 도구
def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() + "Z" if dt else None


def _tags(raw: Optional[str]) -> List[str]:
    try:
        v = json.loads(raw) if raw else []
    except ValueError:
        return []
    return [t for t in v if isinstance(t, str)][:5]


def _preview(body: str) -> str:
    """목록용 미리보기: 마크다운 기호를 걷어내고 한 줄로"""
    t = re.sub(r"```.*?```", " [코드] ", body or "", flags=re.S)
    t = re.sub(r"^\s*[-*•]\s+", " · ", t, flags=re.M)
    t = re.sub(r"^#{1,3}\s+|^>\s?", "", t, flags=re.M)
    t = re.sub(r"\*\*([^*]+)\*\*|`([^`]+)`", lambda m: m.group(1) or m.group(2), t)
    return re.sub(r"\s+", " ", t).strip()[:160]


def _clean_text(s: str) -> str:
    s = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", s).strip()


def _check_spam(text: str):
    if len(_URL_RE.findall(text)) > 8:
        raise HTTPException(status_code=400, detail="링크가 너무 많아요. 8개 이하로 줄여 주세요.")


def _norm_tags(tags: List[str]) -> List[str]:
    out: List[str] = []
    for t in tags[:8]:
        t = (t or "").strip().lstrip("#")
        if not t:
            continue
        if not _TAG_RE.match(t):
            raise HTTPException(status_code=400, detail=f"태그 '{t[:20]}' 는 쓸 수 없어요. 글자·숫자·+#._- 만 20자까지 가능해요.")
        if t.lower() not in [x.lower() for x in out]:
            out.append(t)
    if len(out) > 5:
        raise HTTPException(status_code=400, detail="태그는 5개까지 달 수 있어요.")
    return out


async def _count_since(db: AsyncSession, model, column, user_id: int, since: datetime, user_col=None) -> int:
    uc = user_col or model.user_id
    return (await db.execute(select(func.count()).select_from(model).where(uc == user_id, column >= since))).scalar_one()


async def _notify(db: AsyncSession, user_id: Optional[int], title: str, message: str, link: str, project_id: Optional[int] = None):
    if user_id:
        db.add(Notification(user_id=user_id, project_id=project_id, title=title[:200], message=message[:500], category="community", link=link[:300]))


async def _users_map(db: AsyncSession, ids) -> Dict[int, User]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()}


def _author(u: Optional[User]) -> Dict[str, Any]:
    return {"id": u.id if u else None, "name": u.username if u else "DureSync 운영팀", "official": u is None}


def _hot(p: CommunityPost, now: datetime) -> float:
    hours = max(0.0, (now - p.created_at).total_seconds() / 3600)
    return (p.like_count + 2 * p.comment_count + 3 * p.bookmark_count + 1) / math.pow(hours + 2, 1.2)


async def _post_dict(db: AsyncSession, p: CommunityPost, viewer: Optional[User], users: Dict[int, User], extra: Dict[str, Any],
                     detail: bool = False) -> Dict[str, Any]:
    now = datetime.utcnow()
    d: Dict[str, Any] = {
        "id": p.id, "category": p.category, "category_label": CATEGORIES.get(p.category, p.category), "title": p.title,
        "preview": _preview(p.body),
        "tags": _tags(p.tags), "author": _author(users.get(p.user_id)), "created_at": _iso(p.created_at), "updated_at": _iso(p.updated_at),
        "like_count": p.like_count, "comment_count": p.comment_count, "bookmark_count": p.bookmark_count,
        "is_pinned": p.is_pinned, "status": p.status, "solved": bool(p.accepted_comment_id),
        "liked": p.id in extra.get("liked", set()), "bookmarked": p.id in extra.get("bookmarked", set()),
        "mine": bool(viewer and p.user_id == viewer.id), "is_new": (now - p.created_at) < timedelta(hours=24),
        "project": extra.get("projects", {}).get(p.project_id), "event": extra.get("events", {}).get(p.event_id),
    }
    if p.category == "recruit":
        roles = []
        try:
            roles = [r for r in json.loads(p.recruit_roles or "[]") if isinstance(r, str)]
        except ValueError:
            pass
        accepted = extra.get("accepted", {}).get(p.id, 0)
        slots = p.recruit_slots or 1
        expired = bool(p.recruit_deadline and p.recruit_deadline < date.today())
        d["recruit"] = {
            "roles": roles, "slots": slots, "accepted": accepted, "deadline": p.recruit_deadline.isoformat() if p.recruit_deadline else None,
            "d_day": (None if not p.recruit_deadline else ("D-Day" if p.recruit_deadline == date.today() else (f"D-{(p.recruit_deadline - date.today()).days}" if not expired else "마감"))),
            "open": p.status == "open" and not expired and accepted < slots,
            "applicants": extra.get("applicants", {}).get(p.id, 0), "my_application": extra.get("my_apps", {}).get(p.id),
        }
    if detail:
        d["body"] = p.body
    return d


async def _extras(db: AsyncSession, posts: List[CommunityPost], viewer: Optional[User]) -> Dict[str, Any]:
    ids = [p.id for p in posts]
    ex: Dict[str, Any] = {"liked": set(), "bookmarked": set(), "projects": {}, "events": {}, "accepted": {}, "applicants": {}, "my_apps": {}}
    if not ids:
        return ex
    if viewer:
        ex["liked"] = {r for (r,) in (await db.execute(select(CommunityLike.target_id).where(
            CommunityLike.user_id == viewer.id, CommunityLike.target_type == "post", CommunityLike.target_id.in_(ids)))).all()}
        ex["bookmarked"] = {r for (r,) in (await db.execute(select(CommunityBookmark.post_id).where(
            CommunityBookmark.user_id == viewer.id, CommunityBookmark.post_id.in_(ids)))).all()}
        ex["my_apps"] = {pid: st for pid, st in (await db.execute(select(CommunityApplication.post_id, CommunityApplication.status).where(
            CommunityApplication.user_id == viewer.id, CommunityApplication.post_id.in_(ids)))).all()}
    pids = {p.project_id for p in posts if p.project_id}
    if pids:
        for pr in (await db.execute(select(Project).where(Project.id.in_(pids)))).scalars().all():
            n = (await db.execute(select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == pr.id))).scalar_one() + 1
            ex["projects"][pr.id] = {"id": pr.id, "title": pr.title, "members": n}
    eids = {p.event_id for p in posts if p.event_id}
    if eids:
        today = date.today()
        for e in (await db.execute(select(CrawledEvent).where(CrawledEvent.id.in_(eids)))).scalars().all():
            dl = e.deadline_date
            ex["events"][e.id] = {"id": e.id, "title": e.title, "url": e.url, "image_url": e.image_url, "category": e.category,
                                  "deadline": dl.isoformat() if dl else None, "d_day": (None if not dl else ("마감" if dl < today else ("D-Day" if dl == today else f"D-{(dl - today).days}")))}
    rids = [p.id for p in posts if p.category == "recruit"]
    if rids:
        for pid, st, n in (await db.execute(select(CommunityApplication.post_id, CommunityApplication.status, func.count()).where(
                CommunityApplication.post_id.in_(rids)).group_by(CommunityApplication.post_id, CommunityApplication.status))).all():
            if st == "accepted":
                ex["accepted"][pid] = n
            if st == "pending":
                ex["applicants"][pid] = n
    return ex


def _visible(viewer: Optional[User]):
    base = and_(CommunityPost.is_deleted.is_(False))
    if viewer:
        return and_(base, or_(CommunityPost.is_hidden.is_(False), CommunityPost.user_id == viewer.id))
    return and_(base, CommunityPost.is_hidden.is_(False))


async def _get_post(db: AsyncSession, post_id: int, viewer: Optional[User] = None, for_update: bool = False) -> CommunityPost:
    p = (await db.execute(select(CommunityPost).where(CommunityPost.id == post_id, _visible(viewer)))).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="글을 찾을 수 없어요. 삭제됐을 수 있어요.")
    return p


# ---------------------------------------------------------------- 스키마
class PostIn(BaseModel):
    category: str
    title: str = Field(..., min_length=2, max_length=120)
    body: str = Field(..., min_length=2, max_length=10000)
    tags: List[str] = Field(default_factory=list)
    project_id: Optional[int] = None
    event_id: Optional[int] = None
    recruit_roles: List[str] = Field(default_factory=list)
    recruit_slots: Optional[int] = Field(default=None, ge=1, le=20)
    recruit_deadline: Optional[date] = None


class PostEdit(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    body: Optional[str] = Field(default=None, min_length=2, max_length=10000)
    tags: Optional[List[str]] = None
    recruit_roles: Optional[List[str]] = None
    recruit_slots: Optional[int] = Field(default=None, ge=1, le=20)
    recruit_deadline: Optional[date] = None
    status: Optional[str] = None


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class ApplyIn(BaseModel):
    message: str = Field(..., min_length=2, max_length=500)


class ReportIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=200)


# ---------------------------------------------------------------- 목록
@router.get("/posts")
async def list_posts(
    category: Optional[str] = None, sort: str = "latest", q: Optional[str] = None, tag: Optional[str] = None,
    mine: bool = False, saved: bool = False, open_only: bool = False,
    limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0, le=2000),
    viewer: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db),
):
    """글 목록. sort = latest(최신) | hot(인기) | comments(댓글 많은 순). 고정 글은 항상 위."""
    stmt = select(CommunityPost).where(_visible(viewer))
    if category and category in CATEGORIES:
        stmt = stmt.where(CommunityPost.category == category)
    if mine:
        if not viewer:
            raise HTTPException(status_code=401, detail="로그인이 필요해요.")
        stmt = stmt.where(CommunityPost.user_id == viewer.id)
    if saved:
        if not viewer:
            raise HTTPException(status_code=401, detail="로그인이 필요해요.")
        stmt = stmt.where(CommunityPost.id.in_(select(CommunityBookmark.post_id).where(CommunityBookmark.user_id == viewer.id)))
    if tag:
        stmt = stmt.where(CommunityPost.tags.like(f'%"{tag.strip().lstrip("#")[:20]}"%'))
    if q and q.strip():
        like = f"%{q.strip()[:60]}%"
        stmt = stmt.where(or_(CommunityPost.title.like(like), CommunityPost.body.like(like), CommunityPost.tags.like(like)))
    if open_only:
        stmt = stmt.where(CommunityPost.category == "recruit", CommunityPost.status == "open",
                          or_(CommunityPost.recruit_deadline.is_(None), CommunityPost.recruit_deadline >= date.today()))
    window = datetime.utcnow() - timedelta(days=120 if sort != "latest" else 3650)
    rows = (await db.execute(stmt.where(CommunityPost.created_at >= window).order_by(CommunityPost.id.desc()).limit(600))).scalars().all()
    now = datetime.utcnow()
    if sort == "hot":
        rows.sort(key=lambda p: (not p.is_pinned, -_hot(p, now)))
    elif sort == "comments":
        rows.sort(key=lambda p: (not p.is_pinned, -p.comment_count, -p.id))
    else:
        rows.sort(key=lambda p: (not p.is_pinned, -p.id))
    total = len(rows)
    page = rows[offset:offset + limit]
    users = await _users_map(db, [p.user_id for p in page])
    ex = await _extras(db, page, viewer)
    return {"items": [await _post_dict(db, p, viewer, users, ex) for p in page], "total": total, "has_more": offset + limit < total}


@router.get("/sidebar")
async def sidebar(viewer: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    """인기 태그 · 이번 주 인기글 · 모집 중인 팀"""
    now = datetime.utcnow()
    recent = (await db.execute(select(CommunityPost).where(_visible(viewer), CommunityPost.created_at >= now - timedelta(days=60)).limit(500))).scalars().all()
    counts: Dict[str, int] = {}
    for p in recent:
        for t in _tags(p.tags):
            counts[t] = counts.get(t, 0) + 1
    top_tags = [{"tag": t, "count": c} for t, c in sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:12]]
    week = sorted([p for p in recent if p.created_at >= now - timedelta(days=7) and not p.is_pinned], key=lambda p: -_hot(p, now))[:5]
    recruits = [p for p in recent if p.category == "recruit" and p.status == "open" and (p.recruit_deadline is None or p.recruit_deadline >= date.today())]
    recruits.sort(key=lambda p: (p.recruit_deadline or date.max, -p.id))
    recruits = recruits[:5]
    users = await _users_map(db, [p.user_id for p in week + recruits])
    ex = await _extras(db, week + recruits, viewer)
    return {"tags": top_tags, "hot": [await _post_dict(db, p, viewer, users, ex) for p in week],
            "recruits": [await _post_dict(db, p, viewer, users, ex) for p in recruits]}


# ---------------------------------------------------------------- 글 쓰기 / 상세 / 수정 / 삭제
@router.post("/posts", status_code=status.HTTP_201_CREATED)
async def create_post(data: PostIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="분류를 골라 주세요.")
    title, body = _clean_text(data.title), _clean_text(data.body)
    if len(title) < 2 or len(body) < 2:
        raise HTTPException(status_code=400, detail="제목과 내용을 입력해 주세요.")
    _check_spam(title + " " + body)
    since = datetime.utcnow()
    if await _count_since(db, CommunityPost, CommunityPost.created_at, user.id, since - timedelta(days=1)) >= LIMITS["post_per_day"]:
        raise HTTPException(status_code=429, detail=f"하루에 글은 {LIMITS['post_per_day']}개까지 쓸 수 있어요.")
    dup = (await db.execute(select(CommunityPost.id).where(CommunityPost.user_id == user.id, CommunityPost.title == title,
                                                           CommunityPost.created_at >= since - timedelta(minutes=10)))).first()
    if dup:
        raise HTTPException(status_code=400, detail="방금 같은 제목의 글을 올렸어요.")
    tags = _norm_tags(data.tags)
    project = None
    if data.project_id:
        project = (await db.execute(select(Project).where(Project.id == data.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")
        is_member = project.owner_id == user.id or (await db.execute(select(ProjectMember.id).where(
            ProjectMember.project_id == project.id, ProjectMember.user_id == user.id))).first()
        if not is_member:
            raise HTTPException(status_code=403, detail="내가 참여한 프로젝트만 연결할 수 있어요.")
    roles: List[str] = []
    if data.category == "recruit":
        if project is None or project.owner_id != user.id:
            raise HTTPException(status_code=400, detail="팀원 모집은 내가 만든 프로젝트를 골라야 해요. (수락하면 바로 팀원이 돼요)")
        roles = [r.strip()[:20] for r in data.recruit_roles if r and r.strip()][:6]
        if not roles:
            raise HTTPException(status_code=400, detail="찾는 역할을 하나 이상 적어 주세요. (예: 프론트엔드)")
        if data.recruit_deadline and data.recruit_deadline < date.today():
            raise HTTPException(status_code=400, detail="모집 마감일은 오늘 이후여야 해요.")
    event_id = None
    if data.event_id:
        if (await db.execute(select(CrawledEvent.id).where(CrawledEvent.id == data.event_id))).first():
            event_id = data.event_id
    now = datetime.utcnow()
    post = CommunityPost(
        user_id=user.id, category=data.category, title=title[:150], body=body, tags=json.dumps(tags, ensure_ascii=False),
        project_id=project.id if project and data.category in ("recruit", "showcase") else None, event_id=event_id,
        recruit_roles=json.dumps(roles, ensure_ascii=False) if data.category == "recruit" else None,
        recruit_slots=(data.recruit_slots or 1) if data.category == "recruit" else None,
        recruit_deadline=data.recruit_deadline if data.category == "recruit" else None, created_at=now, updated_at=now,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    users = {user.id: user}
    return await _post_dict(db, post, user, users, await _extras(db, [post], user), detail=True)


@router.get("/posts/{post_id}")
async def get_post(post_id: int, viewer: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, viewer)
    comments = (await db.execute(select(CommunityComment).where(CommunityComment.post_id == p.id).order_by(CommunityComment.id))).scalars().all()
    users = await _users_map(db, [p.user_id] + [c.user_id for c in comments])
    ex = await _extras(db, [p], viewer)
    d = await _post_dict(db, p, viewer, users, ex, detail=True)
    liked_comments = set()
    if viewer and comments:
        liked_comments = {r for (r,) in (await db.execute(select(CommunityLike.target_id).where(
            CommunityLike.user_id == viewer.id, CommunityLike.target_type == "comment", CommunityLike.target_id.in_([c.id for c in comments])))).all()}
    d["comments"] = [{
        "id": c.id, "parent_id": c.parent_id, "author": _author(users.get(c.user_id)),
        "body": "삭제된 댓글이에요." if c.is_deleted else c.body, "deleted": c.is_deleted, "like_count": c.like_count,
        "liked": c.id in liked_comments, "mine": bool(viewer and c.user_id == viewer.id), "created_at": _iso(c.created_at),
        "accepted": p.accepted_comment_id == c.id, "is_author": c.user_id is not None and c.user_id == p.user_id,
    } for c in comments]
    if viewer and p.user_id == viewer.id and p.category == "recruit":
        apps = (await db.execute(select(CommunityApplication).where(CommunityApplication.post_id == p.id).order_by(CommunityApplication.id))).scalars().all()
        au = await _users_map(db, [a.user_id for a in apps])
        d["applications"] = [{"id": a.id, "user": _author(au.get(a.user_id)), "message": a.message, "status": a.status, "created_at": _iso(a.created_at)} for a in apps]
    return d


@router.patch("/posts/{post_id}")
async def edit_post(post_id: int, data: PostEdit, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    if p.user_id != user.id:
        raise HTTPException(status_code=403, detail="내가 쓴 글만 고칠 수 있어요.")
    if data.title is not None:
        p.title = _clean_text(data.title)[:150]
    if data.body is not None:
        p.body = _clean_text(data.body)
    _check_spam(p.title + " " + p.body)
    if data.tags is not None:
        p.tags = json.dumps(_norm_tags(data.tags), ensure_ascii=False)
    if p.category == "recruit":
        if data.recruit_roles is not None:
            roles = [r.strip()[:20] for r in data.recruit_roles if r and r.strip()][:6]
            if not roles:
                raise HTTPException(status_code=400, detail="찾는 역할을 하나 이상 적어 주세요.")
            p.recruit_roles = json.dumps(roles, ensure_ascii=False)
        if data.recruit_slots is not None:
            p.recruit_slots = data.recruit_slots
        if data.recruit_deadline is not None:
            p.recruit_deadline = data.recruit_deadline
        if data.status in ("open", "closed"):
            p.status = data.status
    p.updated_at = datetime.utcnow()
    await db.commit()
    return await get_post(post_id, user, db)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    if p.user_id != user.id:
        raise HTTPException(status_code=403, detail="내가 쓴 글만 지울 수 있어요.")
    p.is_deleted = True
    await db.commit()


# ---------------------------------------------------------------- 반응: 좋아요 / 북마크 / 신고
async def _toggle_like(db: AsyncSession, user: User, target_type: str, target_id: int) -> bool:
    existing = (await db.execute(select(CommunityLike).where(
        CommunityLike.user_id == user.id, CommunityLike.target_type == target_type, CommunityLike.target_id == target_id))).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        return False
    db.add(CommunityLike(user_id=user.id, target_type=target_type, target_id=target_id))
    return True


@router.post("/posts/{post_id}/like")
async def like_post(post_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    on = await _toggle_like(db, user, "post", p.id)
    p.like_count = max(0, p.like_count + (1 if on else -1))
    if on and p.user_id and p.user_id != user.id:
        await _notify(db, p.user_id, "내 글에 좋아요가 달렸어요", f"{user.username}님이 '{p.title[:40]}' 글을 좋아해요", f"community:{p.id}")
    await db.commit()
    return {"liked": on, "like_count": p.like_count}


@router.post("/posts/{post_id}/bookmark")
async def bookmark_post(post_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    ex = (await db.execute(select(CommunityBookmark).where(CommunityBookmark.user_id == user.id, CommunityBookmark.post_id == p.id))).scalar_one_or_none()
    if ex:
        await db.delete(ex); on = False
    else:
        db.add(CommunityBookmark(user_id=user.id, post_id=p.id)); on = True
    p.bookmark_count = max(0, p.bookmark_count + (1 if on else -1))
    await db.commit()
    return {"bookmarked": on, "bookmark_count": p.bookmark_count}


@router.post("/posts/{post_id}/report")
async def report_post(post_id: int, data: ReportIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    if p.user_id == user.id:
        raise HTTPException(status_code=400, detail="내 글은 신고할 수 없어요.")
    if await _count_since(db, CommunityReport, CommunityReport.created_at, user.id, datetime.utcnow() - timedelta(days=1)) >= LIMITS["report_per_day"]:
        raise HTTPException(status_code=429, detail="오늘은 더 신고할 수 없어요.")
    if (await db.execute(select(CommunityReport.id).where(CommunityReport.user_id == user.id, CommunityReport.target_type == "post", CommunityReport.target_id == p.id))).first():
        return {"reported": True, "message": "이미 신고한 글이에요."}
    db.add(CommunityReport(user_id=user.id, target_type="post", target_id=p.id, reason=(data.reason or "")[:200] or None))
    p.report_count += 1
    if p.report_count >= HIDE_AFTER_REPORTS and not p.is_pinned:
        p.is_hidden = True
    await db.commit()
    return {"reported": True, "message": "신고가 접수됐어요. 확인 후 조치할게요."}


# ---------------------------------------------------------------- 댓글
@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(post_id: int, data: CommentIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    body = _clean_text(data.body)
    if not body:
        raise HTTPException(status_code=400, detail="댓글 내용을 입력해 주세요.")
    _check_spam(body)
    if await _count_since(db, CommunityComment, CommunityComment.created_at, user.id, datetime.utcnow() - timedelta(hours=1)) >= LIMITS["comment_per_hour"]:
        raise HTTPException(status_code=429, detail="댓글을 너무 빨리 쓰고 있어요. 잠시 후 다시 해 주세요.")
    parent = None
    if data.parent_id:
        parent = (await db.execute(select(CommunityComment).where(CommunityComment.id == data.parent_id, CommunityComment.post_id == p.id))).scalar_one_or_none()
        if parent is None:
            raise HTTPException(status_code=404, detail="답글을 달 댓글을 찾을 수 없어요.")
    root_id = (parent.parent_id or parent.id) if parent else None          # 답글은 한 단계만
    c = CommunityComment(post_id=p.id, user_id=user.id, parent_id=root_id, body=body)
    db.add(c)
    p.comment_count += 1
    await db.flush()
    link = f"community:{p.id}"
    if parent and parent.user_id and parent.user_id != user.id:
        await _notify(db, parent.user_id, "내 댓글에 답글이 달렸어요", f"{user.username}: {body[:60]}", link)
    if p.user_id and p.user_id != user.id and not (parent and parent.user_id == p.user_id):
        await _notify(db, p.user_id, "내 글에 댓글이 달렸어요", f"{user.username}: {body[:60]}", link)
    await db.commit()
    return {"id": c.id, "comment_count": p.comment_count}


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(CommunityComment).where(CommunityComment.id == comment_id))).scalar_one_or_none()
    if c is None or c.is_deleted:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요.")
    if c.user_id != user.id:
        raise HTTPException(status_code=403, detail="내가 쓴 댓글만 지울 수 있어요.")
    c.is_deleted = True
    p = (await db.execute(select(CommunityPost).where(CommunityPost.id == c.post_id))).scalar_one_or_none()
    if p:
        p.comment_count = max(0, p.comment_count - 1)
        if p.accepted_comment_id == c.id:
            p.accepted_comment_id = None
    await db.commit()


@router.post("/comments/{comment_id}/like")
async def like_comment(comment_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(CommunityComment).where(CommunityComment.id == comment_id, CommunityComment.is_deleted.is_(False)))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요.")
    on = await _toggle_like(db, user, "comment", c.id)
    c.like_count = max(0, c.like_count + (1 if on else -1))
    await db.commit()
    return {"liked": on, "like_count": c.like_count}


@router.post("/posts/{post_id}/accept/{comment_id}")
async def accept_answer(post_id: int, comment_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """질문 글쓴이가 도움이 된 답변을 채택 (다시 누르면 취소)"""
    p = await _get_post(db, post_id, user)
    if p.category != "question" or p.user_id != user.id:
        raise HTTPException(status_code=403, detail="질문을 올린 사람만 답변을 채택할 수 있어요.")
    c = (await db.execute(select(CommunityComment).where(CommunityComment.id == comment_id, CommunityComment.post_id == p.id, CommunityComment.is_deleted.is_(False)))).scalar_one_or_none()
    if c is None or c.parent_id is not None:
        raise HTTPException(status_code=404, detail="채택할 답변을 찾을 수 없어요.")
    if c.user_id == user.id:
        raise HTTPException(status_code=400, detail="내 답변은 채택할 수 없어요.")
    if p.accepted_comment_id == c.id:
        p.accepted_comment_id = None
    else:
        p.accepted_comment_id = c.id
        await _notify(db, c.user_id, "내 답변이 채택됐어요 🎉", f"'{p.title[:40]}' 질문에서 채택됐어요", f"community:{p.id}")
    await db.commit()
    return {"accepted_comment_id": p.accepted_comment_id}


# ---------------------------------------------------------------- 팀원 모집: 지원 → 수락
@router.post("/posts/{post_id}/apply", status_code=status.HTTP_201_CREATED)
async def apply_to_post(post_id: int, data: ApplyIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _get_post(db, post_id, user)
    if p.category != "recruit":
        raise HTTPException(status_code=400, detail="팀원 모집 글이 아니에요.")
    if p.user_id == user.id:
        raise HTTPException(status_code=400, detail="내 모집 글에는 지원할 수 없어요.")
    d = (await _post_dict(db, p, user, {}, await _extras(db, [p], user)))["recruit"]
    if not d["open"]:
        raise HTTPException(status_code=400, detail="이미 마감된 모집이에요.")
    if p.project_id and (await db.execute(select(ProjectMember.id).where(ProjectMember.project_id == p.project_id, ProjectMember.user_id == user.id))).first():
        raise HTTPException(status_code=400, detail="이미 이 프로젝트의 팀원이에요.")
    if await _count_since(db, CommunityApplication, CommunityApplication.created_at, user.id, datetime.utcnow() - timedelta(days=1)) >= LIMITS["apply_per_day"]:
        raise HTTPException(status_code=429, detail="오늘은 더 지원할 수 없어요.")
    msg = _clean_text(data.message)
    _check_spam(msg)
    if (await db.execute(select(CommunityApplication.id).where(CommunityApplication.post_id == p.id, CommunityApplication.user_id == user.id))).first():
        raise HTTPException(status_code=400, detail="이미 지원했어요.")
    db.add(CommunityApplication(post_id=p.id, user_id=user.id, message=msg))
    await _notify(db, p.user_id, "팀원 모집에 새 지원자가 있어요", f"{user.username}님이 '{p.title[:40]}' 에 지원했어요", f"community:{p.id}", p.project_id)
    await db.commit()
    return {"status": "pending"}


@router.delete("/posts/{post_id}/apply", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_application(post_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = (await db.execute(select(CommunityApplication).where(CommunityApplication.post_id == post_id, CommunityApplication.user_id == user.id))).scalar_one_or_none()
    if a is None or a.status != "pending":
        raise HTTPException(status_code=404, detail="취소할 지원이 없어요.")
    await db.delete(a)
    await db.commit()


@router.post("/applications/{app_id}/{decision}")
async def decide_application(app_id: int, decision: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """모집 글쓴이가 지원을 수락하면 곧바로 프로젝트 팀원이 되고, 정원이 차면 모집이 마감된다."""
    if decision not in ("accept", "decline"):
        raise HTTPException(status_code=404, detail="알 수 없는 동작이에요.")
    a = (await db.execute(select(CommunityApplication).where(CommunityApplication.id == app_id))).scalar_one_or_none()
    p = (await db.execute(select(CommunityPost).where(CommunityPost.id == a.post_id, CommunityPost.is_deleted.is_(False)))).scalar_one_or_none() if a else None
    if a is None or p is None:
        raise HTTPException(status_code=404, detail="지원을 찾을 수 없어요.")
    if p.user_id != user.id:
        raise HTTPException(status_code=403, detail="모집 글을 쓴 사람만 처리할 수 있어요.")
    if a.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리한 지원이에요.")
    if decision == "decline":
        a.status = "declined"
        await _notify(db, a.user_id, "지원 결과를 알려드려요", f"'{p.title[:40]}' 모집에는 함께하지 못하게 됐어요", f"community:{p.id}")
        await db.commit()
        return {"status": "declined"}
    project = (await db.execute(select(Project).where(Project.id == p.project_id))).scalar_one_or_none() if p.project_id else None
    if project is None or project.owner_id != user.id:
        raise HTTPException(status_code=400, detail="연결된 프로젝트가 없어서 수락할 수 없어요.")
    accepted = (await db.execute(select(func.count()).select_from(CommunityApplication).where(
        CommunityApplication.post_id == p.id, CommunityApplication.status == "accepted"))).scalar_one()
    if accepted >= (p.recruit_slots or 1):
        raise HTTPException(status_code=400, detail="모집 인원이 이미 찼어요.")
    exists = (await db.execute(select(ProjectMember.id).where(ProjectMember.project_id == project.id, ProjectMember.user_id == a.user_id))).first()
    if not exists and a.user_id != project.owner_id:
        db.add(ProjectMember(project_id=project.id, user_id=a.user_id, role="member"))
    a.status = "accepted"
    if accepted + 1 >= (p.recruit_slots or 1):
        p.status = "closed"
    await _notify(db, a.user_id, "팀에 합류했어요 🎉", f"'{project.title}' 프로젝트의 팀원이 됐어요. 워크스페이스에서 확인해 보세요", f"project:{project.id}", project.id)
    await db.commit()
    return {"status": "accepted", "post_closed": p.status == "closed"}


# ---------------------------------------------------------------- 시작할 때: 안내 글
async def seed_community(session_maker) -> None:
    """글이 하나도 없으면 커뮤니티 이용 안내 글을 고정으로 하나 올려 둔다 (운영팀 글)."""
    async with session_maker() as db:
        if (await db.execute(select(func.count()).select_from(CommunityPost))).scalar_one():
            return
        now = datetime.utcnow()
        db.add(CommunityPost(
            user_id=None, category="free", is_pinned=True, title="DureSync 커뮤니티 이용 안내", created_at=now, updated_at=now,
            tags=json.dumps(["공지"], ensure_ascii=False),
            body=("DureSync 커뮤니티에 오신 걸 환영해요 👋\n\n"
                  "**이런 글을 올릴 수 있어요**\n"
                  "- ❓ 질문: 막힌 걸 물어보고, 도움이 된 답변을 채택해요\n"
                  "- 🤝 팀원 모집: 공모전·해커톤·프로젝트 팀원을 찾아요. 지원을 수락하면 바로 프로젝트 팀원이 돼요\n"
                  "- 🚀 프로젝트 자랑: 만들고 있는 것을 보여주세요\n"
                  "- 💡 정보·노하우, 💬 자유\n\n"
                  "**함께 지켜요**\n"
                  "- 서로 존중하고, 개인정보와 광고성 링크는 올리지 않아요\n"
                  "- 신고가 쌓인 글은 자동으로 가려져요\n\n"
                  "공모전·행사 정보는 **이벤트 · 공모전** 메뉴에서 보고, 마음에 드는 대회가 있다면 거기서 바로 '팀원 구하기' 글을 쓸 수 있어요.")))
        await db.commit()
