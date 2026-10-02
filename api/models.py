from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    username = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # 1:N 관계 (사용자의 코드 실행 히스토리)
    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")
    # 1:N 관계 (연결된 소셜 로그인 계정: Google, Naver ...)
    social_accounts = relationship("SocialAccount", back_populates="user", cascade="all, delete-orphan")

class SocialAccount(Base):
    """소셜 로그인 연동 정보. 로그인할 때마다 last_login_at 이 기록된다."""
    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_id", name="uq_social_provider_id"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)       # "google" | "naver"
    provider_id = Column(String(255), nullable=False)   # 제공자 쪽 사용자 고유 ID
    email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="social_accounts")

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
