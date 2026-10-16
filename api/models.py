from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)
    username = Column(String(100), nullable=False)
    oauth_provider = Column(String(50), nullable=True)  # 'google', 'naver', or None (local)
    oauth_id = Column(String(255), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    ai_name = Column(String(30), nullable=True)   # 채팅에서 AI 를 부를 때 쓰는 이름 (예: "미니" → "미니야 …")
    presence_pref = Column(String(10), default="auto", nullable=False, server_default="auto")   # auto(접속하면 온라인) | away | dnd
    last_seen_at = Column(DateTime, nullable=True)   # 마지막 접속 신호(하트비트). 오래되면 오프라인으로 본다
    is_admin = Column(Boolean, default=False, nullable=False, server_default="0")   # 운영자 (최고관리자는 ADMIN_EMAILS 로 따로 지정)
    ban_reason = Column(String(200), nullable=True)   # 정지 사유 (is_active=False 일 때)
    banned_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # 1:N 관계 (사용자의 코드 실행 히스토리)
    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    language = Column(String(50), nullable=False)
    source_code = Column(Text, nullable=False)
    stdin = Column(Text, nullable=True)
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    compile_output = Column(Text, nullable=True)
    status = Column(String(50), nullable=False)
    execution_time = Column(Float, nullable=True)
    memory_used = Column(Integer, nullable=True)
    exit_code = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="submissions")


class Project(Base):
    """프로젝트(워크스페이스). 지금은 소유자 1명 기준이며, 캘린더 일정의 소속 단위로 쓰인다."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)   # 하루짜리면 start_date 와 같음
    start_time = Column(String(5), nullable=True)         # "HH:MM"
    end_time = Column(String(5), nullable=True)
    all_day = Column(Boolean, default=True, nullable=False)
    kind = Column(String(20), default="manual", nullable=False)  # manual | shared | private | ai
    source = Column(String(300), nullable=True)           # AI 가 일정을 뽑아낸 회의록 문장
    meeting_doc_id = Column(Integer, ForeignKey("meeting_docs.id", ondelete="SET NULL"), nullable=True, index=True)  # 이 일정을 만든 회의록
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class MeetingDoc(Base):
    """사용자가 작성한 회의록. AI 일정 분석의 원문(raw)을 그대로 보관한다."""
    __tablename__ = "meeting_docs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    doc_date = Column(Date, nullable=False, index=True)   # 회의 날짜 ('다음주 화요일' 같은 표현의 기준일)
    attendees = Column(Text, nullable=False, default="[]")  # JSON 배열 문자열
    raw = Column(Text, nullable=False, default="")
    status = Column(String(30), default="완료", nullable=False)
    structure = Column(Text, nullable=True)    # 논의/결정/액션아이템으로 나눈 결과(JSON). AI 구조화·직접 수정 결과를 그대로 보관
    detections = Column(Text, nullable=True)   # AI 가 이 회의록에서 찾은 일정 후보(JSON). 다시 분석하지 않고 카드를 복원하는 데 사용
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ProjectMember(Base):
    """프로젝트 멤버. 소유자(owner_id)는 행이 없어도 멤버로 취급한다."""
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), default="member", nullable=False)   # owner | member
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class ChatMessage(Base):
    """프로젝트 팀 채팅. kind='ai_detect' 는 AI 가 대화에서 찾은 일정 카드(meta 에 JSON)."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    kind = Column(String(20), default="user", nullable=False)     # user | ai_detect
    text = Column(Text, nullable=False)
    meta = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ProjectFile(Base):
    """프로젝트 워크스페이스의 파일. 경로 기준으로 팀원이 함께 쓴다."""
    __tablename__ = "project_files"
    __table_args__ = (UniqueConstraint("project_id", "path", name="uq_project_file_path"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    path = Column(String(300), nullable=False)
    content = Column(Text, nullable=False, default="")
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Notification(Base):
    """팀원 및 개인 실시간 알림 (일정 추가, 팀원 초대, AI 브리핑 등)"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), default="calendar", nullable=False)  # calendar | chat | project | event
    link = Column(String(300), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ProjectInvitation(Base):
    """프로젝트 고유 초대 링크(URL) 토큰"""
    __tablename__ = "project_invitations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(100), unique=True, index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    max_uses = Column(Integer, default=0, nullable=False)  # 0: 무제한
    used_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CrawledEvent(Base):
    """실제 크롤링된 해커톤 및 공모전 데이터 (임의 URL 기반 크롤링 포함)"""
    __tablename__ = "crawled_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    url = Column(String(500), nullable=False)
    title = Column(String(300), nullable=False)
    category = Column(String(50), default="공모전", nullable=False)  # 해커톤 | 공모전 | 기타
    host = Column(String(200), nullable=True)
    deadline = Column(String(100), nullable=True)
    d_day = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    # --- 자동 수집(크롤러)용 ---
    source = Column(String(30), default="manual", nullable=False, index=True)   # devevent | wevity | feed | manual
    ext_key = Column(String(64), nullable=True, index=True)                      # 출처+주소로 만든 고유키 (중복 방지)
    deadline_date = Column(Date, nullable=True, index=True)                       # 접수 마감일(없으면 행사일) — 정렬/마감 처리용
    starts_on = Column(Date, nullable=True)                                       # 행사 시작일
    tags = Column(Text, nullable=True)                                            # JSON 배열
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=True)      # 처음 발견한 시각 (NEW 표시)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=True, index=True)  # 마지막으로 목록에서 확인한 시각
    image_url = Column(String(500), nullable=True)                                # 포스터(og:image) 주소 — 서버는 내려받지 않고 브라우저가 직접 불러온다
    image_checked_at = Column(DateTime, nullable=True)                            # 포스터를 찾아본 시각 (없을 때 매번 다시 찾지 않게)


class EventCrawlRun(Base):
    """이벤트 자동 수집 실행 기록 (출처별). 화면의 '마지막 수집'과 오류 안내에 쓴다."""
    __tablename__ = "event_crawl_runs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source = Column(String(30), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    finished_at = Column(DateTime, nullable=True)
    ok = Column(Boolean, default=False, nullable=False)
    found = Column(Integer, default=0, nullable=False)
    added = Column(Integer, default=0, nullable=False)
    updated = Column(Integer, default=0, nullable=False)
    error = Column(Text, nullable=True)
    trigger = Column(String(20), default="schedule", nullable=False)   # schedule | manual


class CallRoom(Base):
    """프로젝트의 음성 통화방(디스코드의 음성 채널). '기본 통화방'은 저장하지 않고 프로젝트 이름을 그대로 따른다."""
    __tablename__ = "call_rooms"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(40), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# ======================================================================
# 커뮤니티 (질문 · 팀원 모집 · 프로젝트 자랑 · 정보 공유 · 자유)
# ======================================================================
class CommunityPost(Base):
    __tablename__ = "community_posts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)   # NULL = 운영팀 글
    category = Column(String(20), nullable=False, index=True)       # question | recruit | showcase | share | free
    title = Column(String(150), nullable=False)
    body = Column(Text, nullable=False)
    tags = Column(Text, nullable=True)                              # JSON 배열
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)   # 모집·자랑 글이 가리키는 프로젝트
    event_id = Column(Integer, ForeignKey("crawled_events.id", ondelete="SET NULL"), nullable=True)           # 공모전·해커톤 팀원 모집이면 그 이벤트
    # 팀원 모집
    recruit_roles = Column(Text, nullable=True)                     # JSON 배열 (예: ["프론트엔드","디자이너"])
    recruit_slots = Column(Integer, nullable=True)
    recruit_deadline = Column(Date, nullable=True)
    status = Column(String(10), default="open", nullable=False)     # open | closed (모집 글의 모집 상태)
    accepted_comment_id = Column(Integer, nullable=True)            # 질문 글에서 채택된 답변
    # 집계 (목록을 빠르게 그리기 위해 저장해 둔다)
    like_count = Column(Integer, default=0, nullable=False)
    comment_count = Column(Integer, default=0, nullable=False)
    bookmark_count = Column(Integer, default=0, nullable=False)
    report_count = Column(Integer, default=0, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)
    is_hidden = Column(Boolean, default=False, nullable=False)      # 신고가 쌓이면 목록에서 가린다
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CommunityComment(Base):
    __tablename__ = "community_comments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    post_id = Column(Integer, ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_id = Column(Integer, nullable=True)                      # 답글이면 최상위 댓글 id (한 단계만)
    body = Column(Text, nullable=False)
    like_count = Column(Integer, default=0, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CommunityLike(Base):
    __tablename__ = "community_likes"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id", name="uq_community_like"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String(10), nullable=False)                # post | comment
    target_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CommunityBookmark(Base):
    __tablename__ = "community_bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_community_bookmark"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CommunityApplication(Base):
    """팀원 모집 글에 대한 지원"""
    __tablename__ = "community_applications"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_community_application"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    post_id = Column(Integer, ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    status = Column(String(10), default="pending", nullable=False)  # pending | accepted | declined
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CommunityReport(Base):
    __tablename__ = "community_reports"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id", name="uq_community_report"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String(10), nullable=False)
    target_id = Column(Integer, nullable=False)
    reason = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(10), default="open", nullable=False, server_default="open")   # open | resolved | dismissed
    handled_by = Column(Integer, nullable=True)
    handled_at = Column(DateTime, nullable=True)


class AuditLog(Base):
    """관리자가 한 일의 기록 (누가·언제·무엇을). 지우거나 고치는 화면은 없다."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    admin_name = Column(String(100), nullable=False)
    action = Column(String(40), nullable=False, index=True)
    target_type = Column(String(20), nullable=True)
    target_id = Column(Integer, nullable=True)
    detail = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class Announcement(Base):
    """전체 공지 (보낸 기록). 보낼 때 모든 사용자에게 알림으로도 전달된다."""
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(120), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(300), nullable=True)
    sent_count = Column(Integer, default=0, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class UserProfile(Base):
    """내 프로필: 한 줄 소개·자기소개·기술 스택·링크 (포트폴리오 화면에 보인다)"""
    __tablename__ = "user_profiles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    headline = Column(String(120), nullable=True)
    bio = Column(Text, nullable=True)
    skills = Column(Text, nullable=True)     # JSON 배열 (최대 20개)
    links = Column(Text, nullable=True)      # JSON 배열 [{label,url}] (최대 6개)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PortfolioEntry(Base):
    """프로젝트별로 '내가 한 일'을 직접 적는 포트폴리오 항목 (자동 집계 통계는 따로 계산한다)"""
    __tablename__ = "portfolio_entries"
    __table_args__ = (UniqueConstraint("user_id", "project_id", name="uq_portfolio_user_project"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    summary = Column(Text, nullable=True)
    tech = Column(Text, nullable=True)       # JSON 배열 (최대 12개)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Follow(Base):
    """팔로우 관계: follower 가 followee 를 팔로우한다"""
    __tablename__ = "follows"
    __table_args__ = (UniqueConstraint("follower_id", "followee_id", name="uq_follow_pair"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    followee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
