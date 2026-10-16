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
│   └─ polish.css · widgets.css · presence.css · guest.css   (타이포·위젯 갤러리·내 상태·게스트 화면)
└─ js/
    ├─ core/     theme · router(화면 주소) · home-landing · auth · settings · api(서버 연동·웹소켓) · session(게스트/로그인 전환)
    ├─ shell/    menus · presence(내 상태) · notifications(알림·토스트)
    └─ pages/    home-widgets · events · workspace · chat · call · team · notes · calendar · community · admin
```

## 화면 주소

| 주소 | 화면 |
|---|---|
| `/app` | 홈 (처음 들어오면 게스트 화면) |
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
