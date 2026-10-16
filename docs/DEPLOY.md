# 배포 · 자동 업데이트 (AWS / SSH 서버)

`main` 브랜치에 push 하면 서버가 알아서 최신 코드로 바뀌게 하는 방법입니다. (`.github/workflows/deploy.yml`)

## 한 번만 설정
1. **서버 전용 배포 키 만들기** (내 컴퓨터에서)
   ```bash
   ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-deploy"
   ```
   - `deploy_key.pub` 내용을 서버의 `~/.ssh/authorized_keys` 맨 아래에 한 줄 추가
   - `deploy_key`(개인키)는 **GitHub Secrets 에만** 넣고, 이 저장소나 채팅에는 절대 올리지 마세요. 넣은 뒤 컴퓨터에서 지웁니다.
2. **GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret**

   | 이름 | 값 |
   |---|---|
   | `DEPLOY_HOST` | 서버 주소 (예: `duresync.cloud` 또는 퍼블릭 IP) |
   | `DEPLOY_USER` | `ubuntu` / `ec2-user` 등 |
   | `DEPLOY_KEY` | `deploy_key` 파일 전체 내용 |
   | `DEPLOY_PATH` | 서버의 프로젝트 폴더 (예: `/home/ubuntu/code-lounge`) |
   | `DEPLOY_RESTART` | (선택) 재시작 명령. 비우면 `sudo systemctl restart duresync` |
3. 서버에서 재시작 명령이 비밀번호 없이 실행되어야 합니다. (systemd 서비스라면 sudoers 에 해당 명령만 허용)
4. AWS 보안 그룹에서 22번 포트(SSH)가 열려 있어야 합니다. (GitHub 서버가 접속하므로)

## 동작
- `main` 에 push → 서버에 SSH 접속 → `git fetch` + `git reset --hard origin/main` → 패키지 확인 → 재시작
- Secrets 가 없으면 자동으로 **건너뜁니다**(실패하지 않음).
- 서버의 `.env`, `data/`(DB·JWT 비밀키)는 Git 에 없으므로 **그대로 유지**됩니다.
- 수동 실행: GitHub → Actions → Deploy → Run workflow

## 주의
- 서버 안에서 직접 코드를 고치면 다음 배포 때 덮어써집니다. 코드는 항상 내 컴퓨터에서 고쳐서 push 하세요.
- 잘못된 코드를 push 하면 곧바로 서비스에 반영됩니다. 로컬에서 확인한 뒤 push 하는 걸 권장합니다.
