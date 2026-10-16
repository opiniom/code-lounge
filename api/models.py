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

