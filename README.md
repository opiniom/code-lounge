# 올인원 백엔드: 자체 DB, JWT 인증, 코드 실행 샌드박스 & Cloudflare Tunnel

개인 PC 환경에서 **자체 데이터베이스(SQLAlchemy + SQLite/PostgreSQL)**, **JWT 사용자 인증/인가**, **Python & Java 격리 샌드박스**, **실시간 웹소켓 Hub**를 직접 구축하고, **Cloudflare Tunnel**을 통해 외부 Vercel 프론트엔드(Next.js)와 완벽하게 통신할 수 있는 올인원 백엔드 시스템입니다.

---

## 1. 시스템 아키텍처

```
[Vercel Frontend (Next.js)]
         │
         ▼ (HTTPS / WSS 보안 터널)
[Cloudflare Tunnel (*.trycloudflare.com)]
         │
         ▼ (Localhost:8000 포워딩)
[FastAPI 백엔드 서버 (:8000)]
   ├── [Auth] JWT 토큰 발급/검증 (bcrypt 암호화)
   ├── [DB] SQLAlchemy 2.0 Async (c:\backend\data\app.db)
   │     ├── users (회원 계정)
   │     └── submissions (코드 실행 이력)
   ├── [Realtime] WebSocket Hub (/ws/events)
   └── [Sandbox] 격리 샌드박스 엔진
         ├── Python 3.11 런타임 (프로세스 격리)
         └── OpenJDK 17 Hotspot (512MB 힙 제한, javac 컴파일)
```

---

## 2. API 엔드포인트 명세

### 1) 인증 및 계정 관리 (`/api/auth`)
* `POST /api/auth/signup`: 신규 회원가입 (이메일, 비밀번호, 닉네임) -> JWT 토큰 즉시 반환
* `POST /api/auth/login`: 로그인 -> JWT 토큰 반환
* `GET /api/auth/me`: 현재 로그인한 사용자 프로필 조회 (`Authorization: Bearer <token>` 필요)

### 2) 코드 실행 및 히스토리 (`/api`)
* `POST /api/run`: 코드 실행 요청
  * 토큰이 포함된 경우: 실행 결과가 DB `submissions` 테이블에 자동 저장되고 `submission_id` 반환
  * 비로그인(게스트)인 경우: DB 저장 없이 즉시 실행 결과 반환
* `GET /api/submissions`: 내 실행 히스토리 목록 페이징 조회 (`skip`, `limit`)
* `GET /api/submissions/{id}`: 특정 실행 결과 상세 조회

### 3) 실시간 웹소켓 & 헬스체크
* `WS /ws/events`: 코드 실행 이벤트 실시간 수신 웹소켓
* `GET /health`: 서버, 자체 DB, 샌드박스 엔진 상태 점검
* `GET /docs`: 대화형 Swagger API 문서

---

## 3. 프론트엔드(Vercel Next.js) 연동 가이드

### 1) 환경 변수 설정 (`.env.production` 또는 Vercel 설정)
```env
NEXT_PUBLIC_API_URL=https://allows-newest-observe-mails.trycloudflare.com
```

### 2) Next.js 클라이언트 API 연동 코드 예시

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

// 1. 회원가입
export async function signup(email: string, password: string, username: string) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username })
  });
  return await res.json(); // { access_token, user }
}

// 2. 로그인
export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return await res.json(); // { access_token, user }
}

// 3. 코드 실행 요청 (인증 토큰 동봉 시 DB에 자동 저장)
export async function runCode(code: string, language: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source_code: code,
      language: language,
      stdin: '',
      cpu_time_limit: 5.0
    })
  });
  return await res.json(); // { status, stdout, stderr, execution_time, submission_id }
}

// 4. 내 실행 히스토리 조회
export async function getSubmissions(token: string) {
  const res = await fetch(`${API_BASE}/api/submissions`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await res.json(); // { total, items: [...] }
}
```

---

## 4. 로컬 구동 및 테스트 명령어

### 1) API 서버 실행
```powershell
py -3.11 -m uvicorn main:app --app-dir c:\backend\api --host 0.0.0.0 --port 8000
```

### 2) Cloudflare Tunnel 실행
```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8000
```

### 3) 통합 검증 스크립트 실행
```powershell
# DB, JWT 인증, 자동 영속화 테스트
powershell -ExecutionPolicy Bypass -File c:\backend\scripts\test_auth_and_db.ps1

# Python 및 타임아웃 방어 테스트
powershell -ExecutionPolicy Bypass -File c:\backend\scripts\test_python.ps1

# Java 컴파일 및 stdin 입출력 테스트
powershell -ExecutionPolicy Bypass -File c:\backend\scripts\test_java.ps1
```

---

## 5. 데이터베이스 파일 관리

* SQLite 데이터베이스 파일은 [`c:\backend\data\app.db`](file:///c:/backend/data/app.db)에 자동 생성 및 보존됩니다.
* 추후 PostgreSQL로 전환하고 싶을 경우, `.env` 파일의 `DATABASE_URL`을 `postgresql+asyncpg://user:password@localhost:5432/dbname`으로 변경하기만 하면 별도의 코드 수정 없이 즉시 전환됩니다.
