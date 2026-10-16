<p align="center"><img src="docs/brand/mark-128.png" alt="DureSync" height="88"></p>

# DureSync (두레싱크) — 팀 프로젝트 AI 워크스페이스

> **두레(Dure)** — 마을 사람들이 서로의 일을 함께 돕던 한국의 전통 협동 공동체. 그 방식을 AI로 다시 만든 팀 워크스페이스예요.
> 약칭은 **Dure(두레)** 이고, 슬로건은 **Connect · Work · Grow** 입니다. 로고와 아이콘은 `docs/brand/` 에 있어요 (브랜드 색 `#3B82F6` · `#8B5CF6` · `#22D3EE`).

프로젝트 단위로 **워크스페이스(코드) · 회의록 · 캘린더 · 팀 채팅**을 한 곳에서 쓰고, 회의록과 채팅에서 AI가 일정(누가/언제까지)을 찾아 캘린더에 올려주는 협업 플랫폼입니다.

## ▶ 바로 실행하기

```bash
git clone https://github.com/opiniom/code-lounge.git
cd code-lounge
./run.sh          # Windows 는 run.bat 더블클릭
```

실행되면 브라우저가 자동으로 열립니다. 직접 열려면:

**http://localhost:8000/app**

- 처음 실행하면 `.env` 가 자동으로 만들어집니다. 키가 없어도 **게스트로 둘러보기**와 규칙 기반 일정 분석이 동작해요.
- 구글/네이버 로그인, Gemini AI 분석을 쓰려면 `.env` 에 키를 넣으세요 (`docs/social_login_setup.md` 참고). `.env` 는 git 에 올라가지 않습니다.
- 서버 API 문서: http://localhost:8000/docs
- 발표 자료: `presentation.html` (브라우저에서 바로 열기)

### 🔗 떨어져 있는 팀원 초대하기

초대 링크는 서버를 켠 컴퓨터 주소(`localhost`)로는 다른 사람이 열 수 없어요. 아래처럼 **공유 모드**로 켜세요.

```bash
./share.sh        # 임시 공개 주소를 만들어 줍니다 (cloudflared 가 있으면 사용, 없으면 ssh 터널)
```

1. 터미널에 나온 주소가 아니라, 내 컴퓨터의 `http://localhost:8000/app` 에서 로그인하세요.
2. 워크스페이스의 프로젝트 이름 옆 **[팀원 초대]** 를 누르면 초대 링크가 자동으로 만들어져요 (프로젝트를 새로 만들면 이 창이 바로 열려요). 복사해서 보내세요 (공유 주소로 자동 생성).
3. 팀원은 링크를 열고 **이름만 정하고 [초대 수락]** 하면 바로 참여합니다 (가입 불필요). 이미 계정이 있으면 로그인 후 수락.

- 공유 모드에서는 보안을 위해 **코드 실행·API 문서·개발용 로그인이 꺼집니다.** (코드 실행은 `./run.sh` 로 켠 내 컴퓨터에서만)
- 주소를 아는 사람은 누구나 접속할 수 있어요. 끝나면 `Ctrl + C` 로 닫으면 주소도 사라집니다.
- 컴퓨터가 꺼져 있으면 접속할 수 없어요. 항상 켜져 있어야 한다면 클라우드 배포가 필요합니다.


### 🏆 이벤트 · 공모전 자동 수집

서버가 켜져 있는 동안 **해커톤·공모전·개발자 행사**를 알아서 모아 주기적으로 최신화해요 (기본 6시간마다, 서버 시작 직후에도 한 번). 화면의 **[지금 새로고침]**으로 바로 갱신할 수도 있어요 (로그인 필요, 5분에 한 번).

| 출처 | 내용 |
|---|---|
| Dev-Event | 한국 개발자 행사·대회 목록 ([brave-people/Dev-Event](https://github.com/brave-people/Dev-Event) 공개 목록) |
| 위비티 | 공모전 포털의 IT·SW·과학/공학 분야 목록 |
| 콘테스트코리아 | **대외활동**(인턴·서포터즈·동아리·봉사)과 IT·학문·창업 분야 공모전 |
| RSS/Atom | `EVENT_FEEDS` 에 넣은 주소 (선택) |
| 직접 등록 | 화면의 [공고 주소 직접 등록] |

- 설정(`.env`): `EVENT_CRAWL_ENABLED`, `EVENT_CRAWL_INTERVAL_HOURS`, `EVENT_SOURCES`, `EVENT_FEEDS`
- **지키는 규칙**: 각 사이트의 `robots.txt` 가 허용하는 곳만 읽고, 같은 사이트에는 1초 간격으로 요청하며, 식별 가능한 User-Agent(`DureSyncBot`)를 써요. 제목·주최·날짜·태그 같은 사실 정보와 **원문 링크**만 저장하고 본문은 복사하지 않아요. 카드에는 출처를 표시해요.
- **포스터 이미지**: 새로 들어온 이벤트의 페이지에서 대표 이미지(`og:image`) 주소만 찾아 저장하고, 브라우저가 원본 사이트에서 직접 불러와요(서버가 이미지를 복사·저장하지 않아요). 이미지가 없거나 불러오지 못하면 분류별 자동 생성 포스터를 보여줘요. `EVENT_IMAGE_BATCH` 로 한 번에 찾는 개수를 조절하고 0 이면 꺼요.
- 출처 하나가 실패해도 나머지는 계속 돌고, 실패 이유는 화면 상단에 표시돼요. 결과가 비면(사이트 구조 변경) 기존 데이터는 건드리지 않아요.
- 서비스를 **상업적으로 공개하기 전에는** 위비티 등 각 사이트의 이용약관을 확인하거나 제휴·공식 API 를 알아보세요.
- 공고 주소 직접 등록은 서버가 그 주소를 대신 열어 보기 때문에, 내부망 주소(localhost·사설 IP 등)는 막혀 있어요.

### 📞 팀 통화방

채팅 탭 바로 아래 **통화 탭**을 누르면 디스코드처럼 방 목록이 펼쳐집니다. 음성은 팀원 브라우저끼리 직접 연결(WebRTC)돼 지연이 가장 작아요.

- **기본 통화방**은 프로젝트 이름을 그대로 따라가요. 채팅 헤더의 ✏️ 로 프로젝트 이름을 바꾸면(소유자만) 통화방 이름도 함께 바뀝니다.
- **방 만들기**로 프로젝트마다 최대 8개의 방을 더 만들 수 있고, 방마다 최대 6명까지 들어올 수 있어요.
- **다른 장소(다른 네트워크)에서 통화하려면 TURN 중계 서버가 필요합니다.** `.env` 의 `TURN_URLS` 와 `TURN_USERNAME`/`TURN_CREDENTIAL`(Metered 등) 또는 `TURN_SECRET`(직접 운영하는 coturn)을 설정하세요. 설정이 없으면 화면에 안내가 표시되고, 같은 네트워크에서만 확실히 연결돼요.
- 마이크는 `https` 또는 `localhost` 주소에서만 쓸 수 있어요.

### 👥 팀원 화면 · 임시 서버 자동 로그인

- 상단 **팀원** 탭(`/app/team`): 프로젝트별로 누가 접속 중인지(온라인·자리비움·방해금지·오프라인)를 보고, 접속 상태별로 걸러 볼 수 있어요. 소유자는 여기서 팀원 초대·역할 변경(팀장/팀원)·내보내기를, 팀원은 탈퇴를 할 수 있어요. 접속 상태는 실시간으로 바뀝니다.
- **임시(로컬) 서버용 자동 로그인:** 서버를 켤 때 `DEV_AUTO_LOGIN_EMAIL=내이메일@gmail.com` 을 주면, 로그인 버튼을 누르는 순간 그 이메일의 *이미 있는* 계정으로 바로 로그인돼요. 내 컴퓨터(127.0.0.1)에서 직접 접속할 때만 동작하고(프록시·외부 접속은 거부), 계정을 새로 만들지 않아요. **배포 서버에서는 비워 두세요.**
  ```bash
  DEV_AUTO_LOGIN_EMAIL=내이메일@gmail.com EVENT_CRAWL_ENABLED=false .venv/bin/uvicorn main:app --app-dir api --host 127.0.0.1 --port 8080
  ```

### 🏠 처음 실행

처음 접속하면 **홈 화면**이 열리고 위젯은 하나도 없어요. `위젯 추가`로 필요한 것만 골라 홈을 꾸밉니다(선택은 이 기기에 저장).

### 🪪 마이페이지 · 프로필 · 포트폴리오 · 팔로우

- **마이페이지**(아바타 메뉴 맨 위): 내 프로필 요약, 팔로워·팔로잉, 활동 카드(참여 프로젝트·이번 달 일정·회의록·내가 쓴 글 — 눌러서 열기·수정·삭제), 그리고 **내 포트폴리오**(프로젝트별 역할·기간·활동 통계 + 직접 적는 "내가 한 일"·사용 기술)가 한 곳에 모여 있어요.
- **프로필 편집:** 이름·역할·한 줄 소개·자기소개·기술 스택·링크·AI 이름·아바타 색을 한 창에서 자세히 적어요.
- **다른 사람의 프로필**(`/app/profile/사용자번호`): 팀원 카드·커뮤니티 글 작성자·채팅 아바타·알림에서 들어가고, **팔로우 버튼**이 있어요. 프로젝트 내용은 같은 프로젝트 팀원에게만 보이고 외부인에게는 "비공개 프로젝트 N개"로만 나와요.
- **팔로우 알림(인스타그램 방식):** 팔로우하면 상대 알림창에 "○○님이 회원님을 팔로우하기 시작했습니다" + **맞팔로우** 버튼이 실시간으로 떠요. 같은 날 3명 이상이면 "○○님, △△님 외 N명이…"로 묶여요. 서로 팔로우하면 접속 상태도 보여요.
- **사람 찾기:** 이름은 겹치기 쉬워서 **상대방 이메일 주소 전체**를 입력해 찾아요(부분 검색 불가, 결과에 이메일은 나오지 않으며 1분에 20번까지).
- **팀 역할:** 프로젝트를 만든 사람이 **팀장**, 팀장이 지정하면 **부팀장**, 나머지는 **팀원**.

### 📱 모바일 · 반응형

폭이 **820px 이하**(폰·작은 태블릿)이면 CSS 가 자동으로 폰용 화면으로 바꿔요. 컴퓨터 화면은 그대로예요.
- 위쪽 메뉴 대신 **아래쪽 탭 바** — 1쪽: 홈·워크스페이스·회의록·캘린더, 2쪽: 이벤트·커뮤니티·팀원·마이. 옆으로 밀거나 `더보기 ›`를 누르면 부드럽게 넘어가고, 화면을 옮기면 그 메뉴가 있는 쪽으로 저절로 넘어가요(설정·로그아웃은 오른쪽 위 내 아바타 메뉴)
- 채팅은 위쪽 말풍선 버튼으로 열면 **화면 전체**로 열리고(통화는 채팅 머리말의 전화 버튼), 팝업 창은 **아래에서 올라오는 시트**
- 위젯·카드는 한 줄로, 회의록 표는 카드 목록으로, 워크스페이스는 파일 목록이 서랍처럼 덮이고 에디터가 화면 가득
- iOS 안전 영역(노치·홈 바)·주소창 높이 변화·입력칸 확대 방지 처리

### 🗂 화면 주소와 폴더 구조

화면마다 주소가 있어요: `/app`(홈) · `/app/login` · `/app/workspace` · `/app/meetings` · `/app/calendar` · `/app/events` · `/app/community`(글은 `/app/community/12`) · `/app/mypage` · `/app/admin`.
화면 소스는 `frontend/` 아래 `css/`, `js/core|shell|pages/` 로 나뉘어 있습니다. 자세한 구조는 [frontend/README.md](frontend/README.md).

### 🟢 내 상태 (온라인 · 자리비움 · 방해금지)

상단의 상태 버튼(예전 "API 연결됨" 자리)에서 내 상태를 고를 수 있어요.

- **온라인(기본)** — 설정 안 해도 사이트에 들어와 있는 동안 자동으로 온라인, 사이트를 닫거나 연결이 끊기면(신호가 2분 넘게 없으면) 자동으로 **오프라인**으로 보여요.
- **자리비움 / 방해금지** — 직접 고르는 상태예요. 방해금지를 켜면 새 알림 팝업이 꺼지고(알림 목록에는 쌓여요), 다른 기기에서 로그인해도 같은 상태가 이어져요.
- 상태는 **같은 프로젝트의 팀원에게만** 보여요(워크스페이스 상단 팀원 아바타의 색 점). 서버 연결 상태와 서버 주소 설정은 이 메뉴 아래쪽으로 옮겼어요.
- API: `POST /api/presence/heartbeat`(30초마다), `POST /api/presence/offline`, `GET /api/presence/team`

### 💬 커뮤니티

OKKY·디스콰이엇·GeekNews·인프런 같은 개발자 커뮤니티의 좋은 점을 팀 협업 서비스에 맞게 가져왔어요.

- **카테고리 5개** — ❓ 질문 · 🤝 팀원 모집 · 🚀 프로젝트 자랑 · 💡 정보·노하우 · 💬 자유. 정렬은 최신 / 🔥 인기 / 댓글 많은 순, 태그·검색·"내 글/저장한 글" 필터를 지원해요.
- **질문** — 글쓴이가 답변을 **채택**하면 ✓ 해결됨 표시가 붙고 채택 답변이 맨 위로 올라가요.
- **팀원 모집(두레싱크만의 기능)** — 내 프로젝트를 골라 찾는 역할·인원·마감일을 적으면, 지원자를 **수락하는 순간 그 사람이 프로젝트 팀원**이 돼요. 인원이 차면 자동으로 모집 마감. 이벤트 카드의 "👥 이 대회 팀원 구하기"에서 대회 정보가 채워진 채로 바로 글을 쓸 수 있어요.
- 마크다운(코드 블록·인라인 코드·굵게·목록·인용·https 링크)을 지원하고, 글·댓글 모두 **DOM 으로 직접 그려서** 스크립트가 끼어들 수 없어요. 새 지원자·수락·댓글·채택은 알림으로 와요.
- **운영 장치(최소)** — 하루 글 10개 / 시간당 댓글 40개 / 하루 지원 20회 제한, 같은 제목 10분 내 재등록 차단, 태그 5개·링크 8개 제한, 신고 5건이면 자동 숨김, 상단에 고정된 이용 안내 글(운영팀).
- 아직 없는 것: 관리자 화면, 이미지 업로드(링크로 대체), 글 본문 서식 편집기.
- 테스트: 서버를 켠 뒤 `.venv/bin/python tests/test_community_api.py` (52개 항목, 끝나면 테스트 데이터를 스스로 지워요)

---

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
