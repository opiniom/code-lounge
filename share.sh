#!/usr/bin/env bash
# DureSync 외부 공유 스크립트 (macOS / Linux)
#   ./share.sh   → 서버를 '공유 모드'로 켜고, 인터넷에서 열리는 임시 주소를 만들어 줍니다.
#                  그 주소로 만든 초대 링크는 떨어져 있는 팀원도 열 수 있어요.
#
# 안전을 위해 공유 모드에서는 (1) 코드 실행 (2) API 문서 (3) 개발용 로그인 이 꺼집니다.
# 이 창을 닫거나 Ctrl + C 를 누르면 주소도 함께 사라져요. 로컬 개발은 ./run.sh 를 쓰세요.
set -e
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
PORT="${PORT:-8000}"
URL_FILE="data/share_url.txt"

if [ -n "$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null)" ]; then
  echo "포트 $PORT 에서 이미 서버가 켜져 있어요. 그 서버를 먼저 종료(Ctrl + C)한 뒤 다시 실행해주세요." >&2
  exit 1
fi

[ -d .venv ] || { echo "▶ 가상환경 만드는 중…"; "$PY" -m venv .venv; }
echo "▶ 필요한 패키지 확인 중…"
.venv/bin/pip install -q --disable-pip-version-check -r api/requirements.txt
[ -f .env ] || cp .env.example .env
mkdir -p data
rm -f "$URL_FILE"

LOG="$(mktemp -t sync-share.XXXXXX)"
SERVER_PID=""; TUNNEL_PID=""
cleanup() {
  rm -f "$URL_FILE" "$LOG"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ 서버를 공유 모드로 켜는 중…"
PUBLIC_MODE=1 .venv/bin/uvicorn main:app --app-dir api --host 127.0.0.1 --port "$PORT" --log-level warning &
SERVER_PID=$!
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done

echo "▶ 임시 공개 주소를 만드는 중…"
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
  PATTERN='https://[a-z0-9-]+\.trycloudflare\.com'
elif command -v ssh >/dev/null 2>&1; then
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
      -R "80:127.0.0.1:$PORT" nokey@localhost.run >"$LOG" 2>&1 &
  PATTERN='https://[a-z0-9]+\.lhr\.life'
else
  echo "cloudflared 또는 ssh 가 필요해요. (macOS: brew install cloudflared)" >&2
  exit 1
fi
TUNNEL_PID=$!

PUBLIC=""
for _ in $(seq 1 60); do
  PUBLIC="$(grep -Eo "$PATTERN" "$LOG" 2>/dev/null | head -1 || true)"
  [ -n "$PUBLIC" ] && break
  kill -0 "$TUNNEL_PID" 2>/dev/null || break
  sleep 1
done

if [ -z "$PUBLIC" ]; then
  echo "공개 주소를 만들지 못했어요. 인터넷 연결을 확인하고 다시 실행해주세요." >&2
  tail -5 "$LOG" >&2
  exit 1
fi

printf '%s' "$PUBLIC" > "$URL_FILE"
echo ""
echo "  ✅ 공유 주소 (초대 링크가 이 주소로 만들어져요):"
echo "     $PUBLIC/app"
echo ""
echo "  1) 내 컴퓨터에서 http://localhost:$PORT/app 으로 접속(로그인)하세요."
echo "  2) 프로젝트 → 팀원 초대 → [초대 링크 생성] → 복사해서 팀원에게 보내세요."
echo "  3) 팀원은 링크를 열고 이름만 정하면 바로 참여해요."
echo ""
echo "  ⚠️  이 주소를 아는 사람은 누구나 접속할 수 있어요. 끝나면 이 창에서 Ctrl + C 로 닫아주세요."
echo "  (공유 모드에서는 코드 실행·API 문서·개발용 로그인이 꺼져 있어요)"
echo ""
wait "$SERVER_PID"
