#!/bin/sh
# DureSync 러너 설치 (맥 · 리눅스) — 어느 폴더에서 실행해도 돼요.
# 하는 일: ① 파이썬 확인 ② 러너 파일을 ~/.duresync-runner 에 내려받기 ③ 컴퓨터를 켤 때마다 자동으로 켜지게 등록
# 사용:  curl -fsSL __BASE__/runner/install.sh | DURESYNC_TOKEN=연결코드 sh
main() {
  BASE="__BASE__"
  echo ""
  echo "=== DureSync 러너 설치 ==="
  PY=""
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' >/dev/null 2>&1; then PY="$(command -v "$c")"; break; fi
  done
  if [ -z "$PY" ]; then
    echo ""
    echo "[필요] 파이썬 3.7 이상이 없어요. 먼저 파이썬을 설치해 주세요."
    echo "  - 맥:    https://www.python.org/downloads/ 에서 내려받아 설치 (또는 터미널에 xcode-select --install)"
    echo "  - 리눅스: sudo apt install python3"
    echo "설치한 뒤, 이 한 줄을 다시 붙여넣어 주세요."
    return 1
  fi
  DIR="$HOME/.duresync-runner"
  mkdir -p "$DIR" || { echo "[오류] $DIR 폴더를 만들 수 없어요."; return 1; }
  echo "1/3 러너 내려받는 중..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$BASE/runner/duresync_runner.py" -o "$DIR/duresync_runner.py.part"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$BASE/runner/duresync_runner.py" -O "$DIR/duresync_runner.py.part"
  else
    echo "[오류] curl 도 wget 도 없어요."; return 1
  fi
  if [ $? -ne 0 ] || [ ! -s "$DIR/duresync_runner.py.part" ]; then
    echo "[오류] 러너를 내려받지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요."; rm -f "$DIR/duresync_runner.py.part"; return 1
  fi
  mv "$DIR/duresync_runner.py.part" "$DIR/duresync_runner.py"
  echo "2/3 설치 중..."
  ARGS="--install-autostart"
  [ -n "$DURESYNC_NO_START" ] && ARGS="$ARGS --no-start"
  "$PY" "$DIR/duresync_runner.py" $ARGS
}
main "$@"
