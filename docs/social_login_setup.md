# 소셜 로그인 키 발급 가이드

키는 본인 계정으로만 발급할 수 있습니다. 발급한 값은 프로젝트 루트의 `.env` 에 넣으세요 (`.env` 는 git 에 올라가지 않습니다).
로컬 개발 기준 콜백 URL(= Redirect URI)은 아래 두 개입니다.

- `http://localhost:8000/api/auth/google/callback`
- `http://localhost:8000/api/auth/naver/callback`

## Google
1. https://console.cloud.google.com → 프로젝트 선택/생성
2. API 및 서비스 → OAuth 동의 화면 설정 (외부, 앱 이름, 테스트 사용자에 본인 이메일 추가)
3. 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션
4. 승인된 리디렉션 URI 에 위 Google 콜백 URL 추가
5. 발급된 클라이언트 ID/보안 비밀번호 → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Naver
1. https://developers.naver.com/apps → 애플리케이션 등록
2. 사용 API: 네이버 로그인, 제공 정보: 이름(필수), 이메일 주소 선택
3. 서비스 URL: `http://localhost:8000`, Callback URL: 위 Naver 콜백 URL
4. Client ID/Secret → `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
   (개발 중 상태에서는 "멤버관리"에 등록한 계정만 로그인할 수 있습니다)

## 확인
서버 재시작 후 `GET /api/auth/providers` 가 `{"google": true, "naver": true}` 를 반환하면 준비 완료입니다.
