#!/usr/bin/env bash
# sync/ 한 줄 실행 스크립트 (macOS / Linux)
#   ./run.sh            → 서버를 켜고 브라우저로 http://localhost:8000/app 을 엽니다
#   PORT=9000 ./run.sh  → 포트 변경
set -e
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
PORT="${PORT:-8000}"

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "python3 가 필요해요. https://www.python.org 에서 설치한 뒤 다시 실행해주세요." >&2
  exit 1
fi

[ -d .venv ] || { echo "▶ 가상환경 만드는 중…"; "$PY" -m venv .venv; }
echo "▶ 필요한 패키지 확인 중…"
.venv/bin/pip install -q --disable-pip-version-check -r api/requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "▶ .env 를 만들었어요. 구글/네이버/Gemini 키를 넣으면 로그인과 AI 분석이 켜져요. (없어도 게스트·규칙 기반으로 동작)"
fi

URL="http://localhost:${PORT}/app"
echo ""
echo "  ✅ 실행 주소:  ${URL}"
echo "  (종료: Ctrl + C)"
echo ""

( sleep 2
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi ) >/dev/null 2>&1 &

exec .venv/bin/uvicorn main:app --app-dir api --host 0.0.0.0 --port "$PORT"
