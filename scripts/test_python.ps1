param (
    [string]$BaseUrl = "http://localhost:8000"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Testing /health Endpoint" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get
    $health | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "2. Testing Python Code Execution" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$pyCode = @'
import sys

print("Hello from Sandbox Python!")
for i in range(1, 6):
    print(f"Count: {i}")
'@

$body = @{
    source_code = $pyCode
    language    = "python"
    stdin       = ""
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/run" -Method Post -Body $body -ContentType "application/json; charset=utf-8"
    $response | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Execution request failed: $_" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "3. Testing Python Infinite Loop Timeout Protection" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$timeoutCode = @'
print("Starting infinite loop...")
while True:
    pass
'@

$timeoutBody = @{
    source_code    = $timeoutCode
    language       = "python"
    cpu_time_limit = 2.0
} | ConvertTo-Json

try {
    Write-Host "Sending infinite loop with 2.0s timeout limit..." -ForegroundColor Yellow
    $timeoutResp = Invoke-RestMethod -Uri "$BaseUrl/api/run" -Method Post -Body $timeoutBody -ContentType "application/json; charset=utf-8"
    $timeoutResp | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Yellow
} catch {
    Write-Host "Timeout test result: $_" -ForegroundColor Yellow
}
