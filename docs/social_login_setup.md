# 소셜 로그인 (Google & Naver OAuth 2.0) 설정 가이드

본 프로젝트는 **Google OAuth 2.0** 및 **Naver 로그인**을 통한 소셜 로그인을 완벽하게 지원합니다.  
각 플랫폼의 개발자 콘솔에서 Client ID와 Secret을 발급받아 `.env` 파일에 입력하면 즉시 동작합니다.

---

## 1. Google OAuth 2.0 설정 방법

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속하여 로그인합니다.
2. 새 프로젝트를 생성하거나 기존 프로젝트를 선택합니다.
3. 좌측 메뉴 **API 및 서비스 > OAuth 동의 화면**으로 이동합니다.
   - User Type: **외부 (External)** 선택 후 만들기
   - 앱 이름, 사용자 지원 이메일 입력 후 저장
   - 범위(Scope): `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` 추가
4. **API 및 서비스 > 사용자 인증 정보 > 사용자 인증 정보 만들기 > OAuth 클라이언트 ID** 클릭
   - 애플리케이션 유형: **웹 애플리케이션 (Web application)**
   - 승인된 리디렉션 URI (Authorized redirect URIs):
     ```text
     http://localhost:8000/api/auth/google/callback
     ```
     *(실제 배포 도메인이 있을 경우 해당 도메인의 URL도 함께 추가)*
5. 생성 완료 후 화면에 표시되는 **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 복사합니다.
6. 프로젝트 루트 `.env` 파일에 붙여넣습니다:
   ```env
   GOOGLE_CLIENT_ID=발급받은_구글_클라이언트_ID
   GOOGLE_CLIENT_SECRET=발급받은_구글_클라이언트_시크릿
   ```

---

## 2. Naver 로그인 설정 방법

1. [네이버 개발자 센터 (Naver Developers)](https://developers.naver.com/)에 접속하여 로그인합니다.
2. 상단 메뉴 **Application > 애플리케이션 등록**으로 이동합니다.
   - 애플리케이션 이름: `Code Lounge` (원하는 이름)
   - 사용 API: **네이버 로그인 (사용자 이름, 이메일 주소, 별명/프로필 필수 선택)**
3. **로그인 오픈 API 서비스 환경** 설정:
   - 환경: **PC 웹** 추가
   - 서비스 URL:
     ```text
     http://localhost:8000
     ```
   - 네이버 로그인 Callback URL:
     ```text
     http://localhost:8000/api/auth/naver/callback
     ```
4. 등록 완료 후 **내 애플리케이션 > 개요** 탭에서 **Client ID**와 **Client Secret**을 확인합니다.
5. 프로젝트 루트 `.env` 파일에 붙여넣습니다:
   ```env
   NAVER_CLIENT_ID=발급받은_네이버_클라이언트_ID
   NAVER_CLIENT_SECRET=발급받은_네이버_클라이언트_시크릿
   ```

---

## 3. 인증 동작 흐름 (OAuth Flow)

1. 사용자가 UI에서 **[Google로 계속하기]** 또는 **[네이버로 계속하기]** 버튼 클릭
2. 브라우저가 `/api/auth/google/login` 또는 `/api/auth/naver/login`으로 이동하여 인가 코드 요청
3. 인증 성공 시 콜백(`/api/auth/google/callback`, `/api/auth/naver/callback`)에서 사용자 정보 획득
4. SQLite DB(`users` 테이블)에 소셜 사용자 등록/업서트
5. 백엔드에서 자체 **JWT Bearer Access Token** 발급
6. 프론트엔드(`/app` 또는 `/ui`)로 토큰과 함께 자동 리디렉션되어 로그인 완료
