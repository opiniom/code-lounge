# Cloudflare Tunnel 연동 및 외부 공개 가이드

개인 PC의 로컬 백엔드(`http://localhost:8000`)를 외부 포트포워딩이나 공유기 설정(DDNS/DMZ) 없이 **보안 HTTPS 엔드포인트**로 외부 Vercel 프론트엔드에 노출하는 가이드입니다.

---

## 1. 사전 준비 (cloudflared CLI 설치)

Windows PowerShell(관리자 권한)에서 winget을 이용해 설치할 수 있습니다:

```powershell
winget install --id Cloudflare.cloudflared -e
```
설치 후 터미널을 새로 열고 버전을 확인합니다:
```powershell
cloudflared --version
```

---

## 2. 방법 A: Quick Tunnel (가장 빠름, 도메인 소유 불필요, 테스트 권장)

별도 Cloudflare 가입이나 도메인 구매 없이 **즉시 1초 만에 무료 임시 HTTPS URL**을 생성할 수 있습니다.

### 실행 명령어:
```powershell
cloudflared tunnel --url http://localhost:8000
```

### 터미널 출력 예시:
```text
2026-09-18T05:00:00Z INF +--------------------------------------------------------------------------------------------+
2026-09-18T05:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-09-18T05:00:00Z INF |  https://random-words-1234.trycloudflare.com                                               |
2026-09-18T05:00:00Z INF +--------------------------------------------------------------------------------------------+
```

위 생성된 `https://random-words-1234.trycloudflare.com` 주소를 복사하여 Vercel 프론트엔드 API 호출 주소로 사용하면 됩니다.

---

## 3. 방법 B: Named Tunnel (영구 고정 도메인 운영)

Cloudflare에 등록된 도메인이 있는 경우, PC를 재부팅해도 변하지 않는 고정 서브도메인(예: `api-exec.yourdomain.com`)을 사용할 수 있습니다.

### Step 1: Cloudflare 로그인
```powershell
cloudflared tunnel login
```
브라우저가 열리면 Cloudflare 계정에서 연동할 도메인을 선택하여 인증합니다.

### Step 2: 영구 터널 생성
```powershell
cloudflared tunnel create code-runner-tunnel
```
생성 후 출력되는 `Tunnel ID` (UUID 형태)를 확인합니다.

### Step 3: 설정 파일 작성
`C:\Users\<사용자명>\.cloudflared\config.yml` 파일을 열고 다음과 같이 작성합니다:
```yaml
tunnel: <Step 2에서 발급된 Tunnel ID>
credentials-file: C:\Users\<사용자명>\.cloudflared\<Tunnel ID>.json

ingress:
  - hostname: api-exec.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

### Step 4: DNS 라우팅 등록
```powershell
cloudflared tunnel route dns code-runner-tunnel api-exec.yourdomain.com
```

### Step 5: 터널 실행 및 Windows 백그라운드 서비스 등록
```powershell
# 포그라운드 실행 테스트
cloudflared tunnel run code-runner-tunnel

# PC 켜질 때 자동 실행되도록 Windows 서비스 등록 (관리자 권한)
cloudflared service install
Start-Service cloudflared
```

---

## 4. Vercel 프론트엔드 연동 설정

Vercel 대시보드의 **Project Settings > Environment Variables**에 터널 URL을 추가합니다:

```env
NEXT_PUBLIC_CODE_API_URL=https://api-exec.yourdomain.com
# 또는 Quick Tunnel URL
# NEXT_PUBLIC_CODE_API_URL=https://random-words-1234.trycloudflare.com
```

Next.js 클라이언트/서버에서 다음과 같이 호출합니다:
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_CODE_API_URL}/api/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_code: 'print("Hello from Vercel to Local PC")',
    language: 'python',
    stdin: ''
  })
});
const result = await response.json();
console.log(result.stdout);
```
