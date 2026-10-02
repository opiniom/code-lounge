from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, Date, ForeignKey
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
