$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$composeBase = Join-Path $PSScriptRoot 'docker-compose.yml'
$composeSmoke = Join-Path $PSScriptRoot 'docker-compose.smoke.yml'

$project = if ($env:PASSPORT_COMPOSE_PROJECT) { $env:PASSPORT_COMPOSE_PROJECT } else { 'passport-smoke' }

$phone = if ($env:TEST_PHONE) { $env:TEST_PHONE } else { '13800138000' }
$appId = if ($env:PASSPORT_APP_ID) { $env:PASSPORT_APP_ID } else { 'jiuweihu' }

function Wait-HttpOk([string]$url, [int]$timeoutSec = 60) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSec)
  do {
    try {
      $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return $true }
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Post-Json([string]$url, [object]$body, [hashtable]$headers = @{}) {
  return Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) -Headers $headers -TimeoutSec 10
}

Push-Location $repo
try {
  docker compose -p $project -f $composeBase -f $composeSmoke up --build -d | Out-Null

  if (-not (Wait-HttpOk 'http://127.0.0.1:18080/health' 60)) { throw 'sms-stub not ready' }
  if (-not (Wait-HttpOk 'http://127.0.0.1:8080/api/health' 90)) { throw 'frontend/backend not ready' }

  $send = Post-Json 'http://127.0.0.1:8080/api/passport/send-code' @{ phone = $phone }
  if (-not $send.success) { throw ('send-code failed: ' + ($send | ConvertTo-Json -Compress)) }

  $last = Invoke-RestMethod -Method Get -Uri ("http://127.0.0.1:18080/last?phone=" + [uri]::EscapeDataString($phone)) -TimeoutSec 5
  if (-not $last.ok) { throw ('sms-stub last failed: ' + ($last | ConvertTo-Json -Compress)) }
  $code = $last.code

  $login = Post-Json 'http://127.0.0.1:8080/api/passport/login-by-phone' @{ phone = $phone; code = $code; app_id = $appId }

  $verify = Post-Json 'http://127.0.0.1:8080/api/passport/verify-token' @{ access_token = $login.access_token; app_id = $appId }
  if (-not $verify.guid) { throw ('verify-token failed: ' + ($verify | ConvertTo-Json -Compress)) }

  $refresh = Post-Json 'http://127.0.0.1:8080/api/passport/refresh-token' @{ guid = $login.guid; refresh_token = $login.refresh_token; app_id = $appId }
  if (-not $refresh.access_token) { throw ('refresh-token failed: ' + ($refresh | ConvertTo-Json -Compress)) }

  $logout = Post-Json 'http://127.0.0.1:8080/api/passport/logout' @{} @{ Authorization = ("Bearer " + $refresh.access_token) }
  if (-not $logout.success) { throw ('logout failed: ' + ($logout | ConvertTo-Json -Compress)) }

  "SMOKE OK: guid=$($login.guid) app_id=$appId frontend=http://127.0.0.1:8080"
} finally {
  Pop-Location
}

