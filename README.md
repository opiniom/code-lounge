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

---

## 캘린더 · 회의록 AI 일정 감지

- 프로젝트별 캘린더(셀렉터/설정), 연·월 선택, 여러 날에 걸친 일정을 지원하고 서버(`projects`, `calendar_events`)에 저장됩니다.
- 회의록 본문에서 일정의 **시작~종료**를 찾아 "감지된 일정" 카드에 띄우고, 추가를 누르면 해당 프로젝트 캘린더에 들어갑니다.
- 분석 엔진 우선순위: `GEMINI_API_KEY` → `ANTHROPIC_API_KEY` → 규칙 기반(키 불필요). 키는 반드시 `.env` 에만 넣으세요 (`.env` 는 git 에 올라가지 않습니다).
- 엔드포인트: `GET/POST /api/projects`, `GET/POST /api/calendar/events`, `DELETE /api/calendar/events/{id}`, `POST /api/calendar/detect`
- 규칙 기반 분석 테스트: `python tests/test_schedule_rules.py`

---

## 프로젝트 단위 협업 기능

- **프로젝트**: 만들기 / 선택 / 삭제(워크스페이스 ⚙ 프로젝트 관리에서 체크 후 휴지통). 회의록·캘린더·채팅·워크스페이스가 모두 프로젝트 단위로 나뉩니다.
- **팀원 초대**: 프로젝트 소유자가 이메일로 초대 (상대가 한 번 로그인한 계정). 초대받은 사람만 그 프로젝트의 채팅·캘린더·파일에 접근합니다.
- **팀 채팅** (`/api/projects/{id}/messages`): 대화에서 "제가 금요일까지 할게요"처럼 담당과 기한이 나오면 AI가 일정 카드를 띄우고, 추가하면 프로젝트 캘린더에 들어갑니다.
- **워크스페이스 파일** (`/api/projects/{id}/files`): 프로젝트별 파일 저장, 자동 저장, 팀원 변경 감지, 동시 수정 충돌 안내.
- **회의록** (`/api/meetings`): 저장·수정·삭제. 수정하면 이전 내용에서 만든 AI 일정을 지우고 다시 분석하며, 삭제하면 그 회의록의 AI 일정도 함께 삭제됩니다.
- **화면 크기 자동 조절**: 창 너비(1440px 기준)에 맞춰 UI 전체를 자동 확대하고, 설정에서 직접 고를 수도 있습니다.
- **AI 분석 엔진**: Gemini(`GEMINI_API_KEY`, 한도(429) 시 `GEMINI_FALLBACK_MODELS`로 자동 전환) → Claude(`ANTHROPIC_API_KEY`) → 규칙 기반(키 불필요).

> API 키와 OAuth 시크릿은 반드시 `.env`(git 제외)에만 넣으세요. `.env.example`에는 빈 칸만 있습니다.
