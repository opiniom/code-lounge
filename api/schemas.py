from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime

# ================================
# 코드 실행 관련 스키마
# ================================
class CodeRunRequest(BaseModel):
    source_code: str = Field(..., description="실행할 소스 코드")
    language: str = Field(..., description="프로그래밍 언어 (python, java 등)")
    stdin: Optional[str] = Field(default="", description="표준 입력(stdin) 데이터")
    cpu_time_limit: Optional[float] = Field(default=None, description="CPU 실행 제한 시간(초, 최대 10초)")
    memory_limit: Optional[int] = Field(default=None, description="메모리 제한(KB, 최대 512MB = 524288KB)")

class CodeRunResponse(BaseModel):
    status: str = Field(..., description="실행 상태 (Accepted, Time Limit Exceeded 등)")
    stdout: Optional[str] = Field(default=None, description="표준 출력 결과")
    stderr: Optional[str] = Field(default=None, description="표준 에러 로그")
    compile_output: Optional[str] = Field(default=None, description="컴파일 오류 또는 빌드 메시지")
    execution_time: Optional[float] = Field(default=None, description="실행 소요 시간(초)")
    memory_used: Optional[int] = Field(default=None, description="사용된 메모리(KB)")
    exit_code: Optional[int] = Field(default=None, description="종료 코드")
    error: Optional[str] = Field(default=None, description="시스템 또는 통신 오류 메시지")
    submission_id: Optional[int] = Field(default=None, description="데이터베이스에 저장된 실행 이력 고유 ID")

# ================================
# 사용자 인증 관련 스키마
# ================================
class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="사용자 이메일 주소")
    password: str = Field(..., description="비밀번호")

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    oauth_provider: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class SocialLoginRequest(BaseModel):
    provider: str = Field(..., description="google 또는 naver")
    email: EmailStr = Field(..., description="소셜 계정 이메일")
    username: str = Field(..., description="사용자 닉네임 또는 이름")
    oauth_id: Optional[str] = Field(default=None, description="소셜 플랫폼 고유 사용자 ID")

# ================================
# 실행 히스토리 스키마
# ================================
class SubmissionResponse(BaseModel):
    id: int
    user_id: Optional[int]
    language: str
    source_code: str
    stdin: Optional[str]
    stdout: Optional[str]
    stderr: Optional[str]
    compile_output: Optional[str]
    status: str
    execution_time: Optional[float]
    memory_used: Optional[int]
    exit_code: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

class SubmissionListResponse(BaseModel):
    total: int
    items: List[SubmissionResponse]

# ================================
# 시스템 상태 확인 스키마
# ================================
class HealthCheckResponse(BaseModel):
    status: str = Field(..., description="API 서버 상태")
    timestamp: str = Field(..., description="현재 서버 시간")
    database_status: str = Field(..., description="자체 데이터베이스 상태")
    judge0_status: str = Field(..., description="샌드박스 엔진 상태")
    judge0_version: Optional[str] = Field(default=None)
    supported_languages: Optional[List[str]] = Field(default=None)
