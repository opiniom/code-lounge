# frontend — DureSync 화면

서버가 `/app` 으로 내려주는 화면입니다. 예전엔 `index.html` 한 파일(약 8,600줄)이었고, 지금은 종류별로 나눠져 있습니다.

```
frontend/
├─ index.html            화면 뼈대(HTML 마크업)만. 스타일/스크립트는 서버가 묶어서 연결
├─ manifest.json         css / js 파일을 묶는 "순서" (새 파일을 만들면 여기에 추가)
├─ css/
│   ├─ base.css          색·글꼴 토큰, 공통 레이아웃
│   ├─ home.css · workspace.css · notes.css · calendar.css · events.css · community.css · mypage.css · admin.css · auth.css
│   ├─ notifications.css · components.css · editor.css(코드 에디터 테마)
│   └─ polish.css · widgets.css · presence.css · landing.css · splash.css · voice.css   (타이포·위젯 갤러리·내 상태·소개 첫 화면·앱 인사 화면·음성 입력)
└─ js/
    ├─ core/     theme · router(화면 주소) · home-landing · auth · settings · api(서버 연동·웹소켓) · session(로그인 전/후 전환) · splash(설치한 앱 인사 화면) · greeting(시간대별 인사)
    ├─ shell/    menus · presence(내 상태) · notifications(알림·토스트)
    └─ pages/    home-widgets · events · workspace · chat · voice(음성으로 AI 부르기) · call · team · notes · calendar · community · admin
```

## 음성으로 AI 부르기 (`js/pages/voice.js`)

채팅 입력줄의 마이크 버튼을 누르고 "두레야 내일 3시에 회의 잡아줘"처럼 말하면, 글로 바뀌어 **직접 친 것과 똑같이** 채팅 → AI 로 처리됩니다 (AI 호출어로 시작하면 1.6초 뒤 자동 전송, 그 안에 [취소]·글 수정 가능. 호출어 없이 말하면 입력칸에만 채워 줘요. '나만 보는 AI' 탭에서는 호출어 없이도 보냄).
- 브라우저 음성 인식(Web Speech)이 되면 그걸 쓰고, 안 되는 곳(아이폰 설치 앱 등)은 녹음 → `POST /api/ai/transcribe` (Gemini 받아쓰기, 서버에 `GEMINI_API_KEY` 필요, 사용자당 시간당 40회) 로 처리. 소리는 저장하지 않아요.
- 호출어 오인식('두래야', '듀레야')은 AI 이름(기본 이름 + 내가 정한 이름)에 맞게 보정합니다.

## 두레(채팅 AI)가 쓸 수 있는 자료·일 (`api/services/chat_ai.py`)

AI 호출은 요청당 **1회** 그대로(Gemini 무료 한도 보호). 대신 **말한 내용에 맞는 자료만** 골라 함께 건넵니다.

| 이런 말이 나오면 | 함께 보는 자료 |
|---|---|
| 커뮤니티·게시글·모집·추천 … | 공개 커뮤니티 글 40개 + 내 프로필(기술·소개)·참여 프로젝트 → 맞는 글을 골라 **눌러서 열리는 칩**으로 |
| 공모전·해커톤·대회 … | 마감 임박 공모전·행사 25개 |
| 파일·코드·`main.py`·`19번 줄` … | 프로젝트 파일 목록 + 말한 파일의 내용(줄 번호 포함) |
| 전체·모든·내 일정·이번 주 … | 내가 속한 모든 프로젝트의 2주 일정 |
| 알림 / 저장한 글 / 대화·어제·누가 … | 내 알림 / 북마크 / 더 오래된 팀 대화 |

- **팀원에게 요청 전달**: "민수님께 main.py 19번 줄 수정 부탁한다고 전해줘" → 그 팀원에게 파일·줄 위치가 달린 알림(누르면 그 줄이 열림). 되돌리기 가능. AI 가 파일을 직접 고치지는 않아요.
- **AI 를 안 불러도**: 평범한 팀 대화의 "민수님 main.py 19번 줄 수정 부탁드려요"처럼 `이름+님/씨` + 실제 있는 파일 + 부탁하는 말이 모두 있으면 규칙으로 알림 (AI 호출 없음, 같은 요청은 10분 내 중복 방지).
- 읽기 범위는 **호출한 사람이 볼 수 있는 것만**: 내 프로젝트 · 공개 글 · 내 알림. 남의 개인 AI 대화, 다른 프로젝트 파일·일정은 건네지 않아요.
- 알림 링크 형식: `file:프로젝트번호:줄:경로` → `wsJumpTo()` 가 워크스페이스를 열고 그 줄로 이동.

## 화면 주소

| 주소 | 화면 |
|---|---|
| `/app` | 로그인 전: 서비스 소개(첫 화면) · 로그인 후: 홈 (로그인해야 쓸 수 있고, 게스트 둘러보기는 없어요) |
| `/app?pwa=1` | 브라우저에서 '설치한 앱'처럼 미리 보기 (인사 화면 → 로그인 전이면 바로 로그인 화면). `?splash=1` 은 인사 화면만 |
| `/app/login` | 로그인 |
| `/app/workspace` | 워크스페이스 (코드 에디터) |
| `/app/meetings` | 회의록 |
| `/app/calendar` | 캘린더 |
| `/app/events` | 이벤트·공모전 |
| `/app/community` · `/app/community/12` | 커뮤니티 · 글 12번 |
| `/app/mypage` · `/app/admin` | 마이페이지 · 팀 관리 |

주소를 직접 열거나 새로고침해도 그 화면이 열리고, 브라우저의 뒤로/앞으로 가기도 동작합니다. 새 화면을 추가하려면
`index.html` 에 `<section class="view" data-view="이름">` 을 만들고 `js/core/router.js` 의 `ROUTES` 에 주소를 한 줄 넣으면 됩니다.

## 어떻게 합쳐지나
- 서버(`api/main.py`)가 `manifest.json` 순서대로 파일을 이어 붙여 `/static/bundle.css`, `/static/bundle.js` 로 내려줍니다.
  파일이 바뀌면 자동으로 버전(`?v=`)이 바뀌어 브라우저가 새로 받습니다. 별도 빌드 도구(npm 등)는 필요 없어요.
- 합치는 순서가 곧 실행 순서입니다. 예전 한 파일일 때와 똑같이 동작하도록 원래 순서를 그대로 지켰습니다.
- `index.html` 을 더블클릭해서 여는 방식은 더 이상 쓰지 않습니다. `./run.sh` 로 서버를 켜고 `http://localhost:8000/app` 으로 접속하세요.
