@echo off
chcp 65001 >nul
REM sync/ 한 줄 실행 스크립트 (Windows)  -  더블클릭하면 서버가 켜지고 브라우저가 열립니다
cd /d "%~dp0"

if not defined PORT set PORT=8000
REM 기본은 이 컴퓨터에서만 접속 (같은 와이파이 기기도 허용하려면 HOST=0.0.0.0 으로 실행)
if not defined HOST set HOST=127.0.0.1

where python >nul 2>nul
if errorlevel 1 (
  echo python 이 필요해요. https://www.python.org 에서 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)

if not exist .venv (
  echo ^> 가상환경 만드는 중...
  python -m venv .venv
)
echo ^> 필요한 패키지 확인 중...
.venv\Scripts\python.exe -m pip install -q --disable-pip-version-check -r api\requirements.txt

if not exist .env (
  copy .env.example .env >nul
  echo ^> .env 를 만들었어요. 구글/네이버/Gemini 키를 넣으면 로그인과 AI 분석이 켜져요.
)

echo.
echo   실행 주소:  http://localhost:%PORT%/app
echo   (종료: 이 창에서 Ctrl + C)
echo.
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%/app"
.venv\Scripts\python.exe -m uvicorn main:app --app-dir api --host %HOST% --port %PORT%
