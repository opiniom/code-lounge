"""프로필 · 포트폴리오 · 팔로우.

- 프로필: 한 줄 소개, 자기소개, 기술 스택, 링크 (직접 적는다)
- 포트폴리오: 내가 참여한 프로젝트별로 역할·기간·팀 규모와, 서비스 안에서 한 활동(파일·회의록·일정·채팅·글)을 자동으로 집계해서 보여주고,
  '내가 한 일' 설명과 사용 기술은 직접 적는다.
- 다른 사람의 프로필은 누구나(로그인한 사용자) 볼 수 있지만, 프로젝트 내용은 같은 프로젝트 팀원에게만 보인다.
- 팔로우: 서로 팔로우(친구)하면 접속 상태도 보인다. 팔로우하면 상대에게 실시간 알림이 간다.
"""
import json
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (CalendarEvent, CommunityPost, Follow, MeetingDoc, Notification, PortfolioEntry,
                    Project, ProjectFile, ProjectMember, User, UserProfile)
from services.access import member_project_ids
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/profile", tags=["Profile"])
follow_router = APIRouter(prefix="/api/follows", tags=["Follow"])

_URL = re.compile(r"^https?://[^\s]{3,300}$", re.I)
MAX_FOLLOWING = 500


def _jl(text: Optional[str]) -> list:
    try:
        v = json.loads(text) if text else []
        return v if isinstance(v, list) else []
    except ValueError:
        return []


def _clean_list(items, max_items: int, max_len: int) -> List[str]:
    out, seen = [], set()
    for x in items or []:
        t = re.sub(r"\s+", " ", str(x)).strip()[:max_len]
        if t and t.lower() not in seen:
            seen.add(t.lower()); out.append(t)
        if len(out) >= max_items:
            break
    return out


class ProfileIn(BaseModel):
    headline: str = Field(default="", max_length=120)
    bio: str = Field(default="", max_length=2000)
    skills: List[str] = Field(default_factory=list)
    links: List[dict] = Field(default_factory=list)


class EntryIn(BaseModel):
    summary: str = Field(default="", max_length=2000)
    tech: List[str] = Field(default_factory=list)


async def _counts(db: AsyncSession, uid: int):
    followers = (await db.execute(select(func.count()).select_from(Follow).where(Follow.followee_id == uid))).scalar_one()
    following = (await db.execute(select(func.count()).select_from(Follow).where(Follow.follower_id == uid))).scalar_one()
    return followers, following


async def _relation(db: AsyncSession, viewer_id: int, target_id: int):
    a = (await db.execute(select(Follow.id).where(Follow.follower_id == viewer_id, Follow.followee_id == target_id))).scalar_one_or_none()
    b = (await db.execute(select(Follow.id).where(Follow.follower_id == target_id, Follow.followee_id == viewer_id))).scalar_one_or_none()
    return a is not None, b is not None


async def _payload(db: AsyncSession, viewer: User, target: User) -> dict:
    is_self = viewer.id == target.id
    prof = (await db.execute(select(UserProfile).where(UserProfile.user_id == target.id))).scalar_one_or_none()
    followers, following = await _counts(db, target.id)
    i_follow, follows_me = (False, False) if is_self else await _relation(db, viewer.id, target.id)

    # 이 사람이 참여한 프로젝트
    t_owned = (await db.execute(select(Project).where(Project.owner_id == target.id))).scalars().all()
    t_member_rows = (await db.execute(select(ProjectMember).where(ProjectMember.user_id == target.id))).scalars().all()
    member_proj = {p.id: p for p in (await db.execute(select(Project).where(Project.id.in_([m.project_id for m in t_member_rows] or [-1])))).scalars().all()}
    viewer_ids = set(await member_project_ids(db, viewer))
    items = []
    hidden = 0
    entries = {e.project_id: e for e in (await db.execute(select(PortfolioEntry).where(PortfolioEntry.user_id == target.id))).scalars().all()}

    async def build(p: Project, role: str, joined: datetime):
        pid = p.id
        files = (await db.execute(select(func.count()).select_from(ProjectFile).where(ProjectFile.project_id == pid, ProjectFile.updated_by == target.id))).scalar_one()
        notes = (await db.execute(select(func.count()).select_from(MeetingDoc).where(MeetingDoc.project_id == pid, MeetingDoc.user_id == target.id))).scalar_one()
        events = (await db.execute(select(func.count()).select_from(CalendarEvent).where(CalendarEvent.project_id == pid, CalendarEvent.user_id == target.id))).scalar_one()
        posts = (await db.execute(select(func.count()).select_from(CommunityPost).where(CommunityPost.project_id == pid, CommunityPost.user_id == target.id, CommunityPost.is_deleted == False))).scalar_one()  # noqa: E712
        n_members = (await db.execute(select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == pid))).scalar_one() + 1
        e = entries.get(pid)
        return {
            "project_id": pid, "title": p.title, "role": role, "joined_at": joined.isoformat() if joined else None,
            "created_at": p.created_at.isoformat() if p.created_at else None, "member_count": n_members,
            "stats": {"files": files, "notes": notes, "events": events, "posts": posts},
            "summary": (e.summary or "") if e else "", "tech": _jl(e.tech) if e else [],
        }

    for p in t_owned:
        if is_self or p.id in viewer_ids:
            items.append(await build(p, "owner", p.created_at))
        else:
            hidden += 1
    for m in t_member_rows:
        p = member_proj.get(m.project_id)
        if not p:
            continue
        if is_self or p.id in viewer_ids:
            items.append(await build(p, "leader" if m.role == "leader" else "member", m.created_at))
        else:
            hidden += 1
    items.sort(key=lambda x: x["joined_at"] or "", reverse=True)

    posts_total = (await db.execute(select(func.count()).select_from(CommunityPost).where(
        CommunityPost.user_id == target.id, CommunityPost.is_deleted == False, CommunityPost.is_hidden == False))).scalar_one()  # noqa: E712
    return {
        "user": {"id": target.id, "name": target.username, "email": target.email if is_self else None, "joined_at": target.created_at.isoformat() if target.created_at else None},
        "is_self": is_self, "i_follow": i_follow, "follows_me": follows_me,
        "followers": followers, "following": following,
        "profile": {
            "headline": (prof.headline or "") if prof else "", "bio": (prof.bio or "") if prof else "",
            "skills": _jl(prof.skills) if prof else [], "links": _jl(prof.links) if prof else [],
        },
        "projects": items, "hidden_projects": hidden, "posts": posts_total,
    }


@router.get("/search")
async def search_people(q: str = Query("", max_length=40), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """이름으로 사람 찾기 (이메일은 보여주지 않는다). 2글자 이상."""
    q = q.strip()
    if len(q) < 2:
        return []
    rows = (await db.execute(select(User).where(User.username.like(f"%{q}%"), User.id != current_user.id, User.is_active == True).limit(12))).scalars().all()  # noqa: E712
    ids = [u.id for u in rows]
    profs = {p.user_id: p for p in (await db.execute(select(UserProfile).where(UserProfile.user_id.in_(ids or [-1])))).scalars().all()}
    mine = {r for r in (await db.execute(select(Follow.followee_id).where(Follow.follower_id == current_user.id))).scalars().all()}
    return [{"id": u.id, "name": u.username, "headline": (profs[u.id].headline if u.id in profs else "") or "", "i_follow": u.id in mine}
            for u in rows if not (u.email or "").endswith("@guest.sync.local")]


@router.get("/me")
async def my_profile(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _payload(db, current_user, current_user)


@router.put("/me")
async def save_profile(data: ProfileIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    links = []
    for l in (data.links or [])[:6]:
        url = str((l or {}).get("url", "")).strip()
        label = re.sub(r"\s+", " ", str((l or {}).get("label", ""))).strip()[:30]
        if url and not _URL.match(url):
            raise HTTPException(status_code=400, detail="링크는 http:// 또는 https:// 로 시작하는 주소여야 해요.")
        if url:
            links.append({"label": label or url.split("//", 1)[-1][:30], "url": url})
    row = (await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))).scalar_one_or_none()
    if row is None:
        row = UserProfile(user_id=current_user.id)
        db.add(row)
    row.headline = data.headline.strip()[:120]
    row.bio = data.bio.strip()[:2000]
    row.skills = json.dumps(_clean_list(data.skills, 20, 30), ensure_ascii=False)
    row.links = json.dumps(links, ensure_ascii=False)
    await db.commit()
    return await _payload(db, current_user, current_user)


@router.put("/me/projects/{project_id}")
async def save_entry(project_id: int, data: EntryIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if project_id not in set(await member_project_ids(db, current_user)):
        raise HTTPException(status_code=403, detail="참여 중인 프로젝트만 적을 수 있어요.")
    row = (await db.execute(select(PortfolioEntry).where(PortfolioEntry.user_id == current_user.id, PortfolioEntry.project_id == project_id))).scalar_one_or_none()
    if row is None:
        row = PortfolioEntry(user_id=current_user.id, project_id=project_id)
        db.add(row)
    row.summary = data.summary.strip()[:2000]
    row.tech = json.dumps(_clean_list(data.tech, 12, 30), ensure_ascii=False)
    await db.commit()
    return {"ok": True}


@router.get("/{user_id}")
async def user_profile(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    target = (await db.execute(select(User).where(User.id == user_id, User.is_active == True))).scalar_one_or_none()  # noqa: E712
    if target is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없어요.")
    return await _payload(db, current_user, target)


# ---------------- 팔로우 ----------------
async def _brief(db: AsyncSession, viewer_id: int, ids: List[int]):
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(ids or [-1])))).scalars().all()}
    profs = {p.user_id: p for p in (await db.execute(select(UserProfile).where(UserProfile.user_id.in_(ids or [-1])))).scalars().all()}
    mine = set((await db.execute(select(Follow.followee_id).where(Follow.follower_id == viewer_id))).scalars().all())
    theirs = set((await db.execute(select(Follow.follower_id).where(Follow.followee_id == viewer_id))).scalars().all())
    from routers.presence import effective_status
    from services import live
    now = datetime.utcnow()
    out = []
    for i in ids:
        u = users.get(i)
        if not u:
            continue
        mutual = i in mine and i in theirs
        out.append({"id": i, "name": u.username, "headline": (profs[i].headline if i in profs else "") or "", "i_follow": i in mine, "follows_me": i in theirs,
                    "mutual": mutual, "status": effective_status(u.presence_pref, now if live.hub.is_online(i) else u.last_seen_at, now) if mutual else None})
    return out


@follow_router.get("/state")
async def follow_state(ids: str = Query("", max_length=400), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """여러 사람에 대한 내 팔로우 상태를 한 번에 (팔로우 버튼을 그릴 때 쓴다). ids=1,2,3"""
    want = []
    for x in ids.split(","):
        x = x.strip()
        if x.isdigit() and int(x) != current_user.id and len(want) < 60:
            want.append(int(x))
    if not want:
        return {}
    mine = set((await db.execute(select(Follow.followee_id).where(Follow.follower_id == current_user.id, Follow.followee_id.in_(want)))).scalars().all())
    theirs = set((await db.execute(select(Follow.follower_id).where(Follow.followee_id == current_user.id, Follow.follower_id.in_(want)))).scalars().all())
    return {str(i): {"i_follow": i in mine, "follows_me": i in theirs} for i in want}


@follow_router.get("/me")
async def my_follows(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fl = (await db.execute(select(Follow.follower_id).where(Follow.followee_id == current_user.id).order_by(Follow.id.desc()))).scalars().all()
    fg = (await db.execute(select(Follow.followee_id).where(Follow.follower_id == current_user.id).order_by(Follow.id.desc()))).scalars().all()
    return {"followers": await _brief(db, current_user.id, list(fl)), "following": await _brief(db, current_user.id, list(fg))}


@follow_router.post("/{user_id}")
async def follow(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="나 자신은 팔로우할 수 없어요.")
    target = (await db.execute(select(User).where(User.id == user_id, User.is_active == True))).scalar_one_or_none()  # noqa: E712
    if target is None or (target.email or "").endswith("@guest.sync.local"):
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없어요.")
    exists = (await db.execute(select(Follow.id).where(Follow.follower_id == current_user.id, Follow.followee_id == user_id))).scalar_one_or_none()
    if exists is None:
        n = (await db.execute(select(func.count()).select_from(Follow).where(Follow.follower_id == current_user.id))).scalar_one()
        if n >= MAX_FOLLOWING:
            raise HTTPException(status_code=400, detail=f"팔로우는 최대 {MAX_FOLLOWING}명까지 할 수 있어요.")
        db.add(Follow(follower_id=current_user.id, followee_id=user_id))
        recent = (await db.execute(select(Notification.id).where(Notification.user_id == user_id, Notification.category == "follow",
                                                                  Notification.link == f"profile:{current_user.id}", Notification.is_read == False))).scalar_one_or_none()  # noqa: E712
        if recent is None:
            db.add(Notification(user_id=user_id, title="새 팔로워", message=f"{current_user.username}님이 회원님을 팔로우했어요.", category="follow", link=f"profile:{current_user.id}"))
        await db.commit()
    followers, _ = await _counts(db, user_id)
    i_follow, follows_me = await _relation(db, current_user.id, user_id)
    return {"i_follow": i_follow, "follows_me": follows_me, "followers": followers}


@follow_router.delete("/{user_id}")
async def unfollow(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(Follow).where(Follow.follower_id == current_user.id, Follow.followee_id == user_id))).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()
    followers, _ = await _counts(db, user_id)
    i_follow, follows_me = await _relation(db, current_user.id, user_id)
    return {"i_follow": i_follow, "follows_me": follows_me, "followers": followers}
