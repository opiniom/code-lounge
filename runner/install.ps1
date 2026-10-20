# DureSync 러너 설치 (윈도우 PowerShell) — 어느 폴더에서 실행해도 돼요.
# 사용:  $env:DURESYNC_TOKEN='연결코드'; irm __BASE__/runner/install.ps1 | iex
function Install-DureSyncRunner {
  $base = '__BASE__'
  try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
  $env:PYTHONIOENCODING = 'utf-8'
  Write-Host ''
  Write-Host '=== DureSync 러너 설치 ==='
  # 파이썬 찾기 (py 런처 → python). 마이크로소프트 스토어로 연결만 해 주는 가짜 python 은 건너뛴다
  $py = $null; $pyArgs = @()
  $cmd = Get-Command py -ErrorAction SilentlyContinue
  if ($cmd) {
    & $cmd.Source -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $py = $cmd.Source; $pyArgs = @('-3') }
  }
  if (-not $py) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notlike '*WindowsApps*') {
      & $cmd.Source -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" 2>$null
      if ($LASTEXITCODE -eq 0) { $py = $cmd.Source }
    }
  }
  if (-not $py) {
    Write-Host ''
    Write-Host '[필요] 파이썬 3.7 이상이 없어요. 먼저 파이썬을 설치해 주세요.'
    Write-Host '  1) https://www.python.org/downloads/ 에서 내려받아 설치 (설치 첫 화면의 "Add python.exe to PATH" 체크)'
    Write-Host '  2) 또는 PowerShell 에 이 한 줄:  winget install Python.Python.3.12'
    Write-Host '설치한 뒤 PowerShell 을 닫았다가 새로 열고, 이 한 줄을 다시 붙여넣어 주세요.'
    return
  }
  $dir = Join-Path $env:USERPROFILE '.duresync-runner'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Host '1/3 러너 내려받는 중...'
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$base/runner/duresync_runner.py" -OutFile (Join-Path $dir 'duresync_runner.py.part')
    Move-Item -Force (Join-Path $dir 'duresync_runner.py.part') (Join-Path $dir 'duresync_runner.py')
  } catch {
    Write-Host '[오류] 러너를 내려받지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.'
    return
  }
  Write-Host '2/3 설치 중...'
  $a = @($pyArgs) + @((Join-Path $dir 'duresync_runner.py'), '--install-autostart')
  if ($env:DURESYNC_NO_START) { $a += '--no-start' }
  & $py @a
}
Install-DureSyncRunner
