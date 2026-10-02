param (
    [string]$BaseUrl = "http://localhost:8000"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Testing /health Endpoint & DB Connection" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get
    $health | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "2. Testing User Signup (/api/auth/signup)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$rand = Get-Random -Minimum 1000 -Maximum 9999
$email = "developer$rand@example.com"
$signupBody = @{
    email    = $email
    password = "SecurePassword123!"
    username = "DevUser$rand"
} | ConvertTo-Json

try {
    $signupResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/signup" -Method Post -Body $signupBody -ContentType "application/json; charset=utf-8"
    Write-Host "Signup Success! Generated Token for user:" -ForegroundColor Green
    $signupResp.user | ConvertTo-Json | Write-Host -ForegroundColor Green
    $token = $signupResp.access_token
} catch {
    Write-Host "Signup failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "3. Testing /api/auth/me with Bearer Token" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$headers = @{
    Authorization = "Bearer $token"
}

try {
    $me = Invoke-RestMethod -Uri "$BaseUrl/api/auth/me" -Method Get -Headers $headers
    $me | ConvertTo-Json | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Get me failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "4. Testing /api/run with Auth (Auto DB Persistence)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$pyCode = @'
total = sum([x * 2 for x in range(1, 11)])
print(f"Calculated sum: {total}")
'@

$runBody = @{
    source_code = $pyCode
    language    = "python"
} | ConvertTo-Json

try {
    $runResp = Invoke-RestMethod -Uri "$BaseUrl/api/run" -Method Post -Body $runBody -Headers $headers -ContentType "application/json; charset=utf-8"
    Write-Host "Code Executed! Saved to DB with Submission ID:" $runResp.submission_id -ForegroundColor Green
    $runResp | ConvertTo-Json | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Run code failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "5. Testing /api/submissions (Query Saved History)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

try {
    $history = Invoke-RestMethod -Uri "$BaseUrl/api/submissions" -Method Get -Headers $headers
    Write-Host "Total Submissions in DB for user:" $history.total -ForegroundColor Green
    $history.items | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Query submissions failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n>>> All Database, Auth & Execution tests PASSED! <<<" -ForegroundColor Green
