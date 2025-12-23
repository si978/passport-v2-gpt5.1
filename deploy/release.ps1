param(
  [ValidateSet('prod', 'smoke')]
  [string]$Mode = 'prod',
  [switch]$SkipChecks,
  [switch]$SkipWait
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$composeBase = Join-Path $PSScriptRoot 'docker-compose.yml'
$composeSmoke = Join-Path $PSScriptRoot 'docker-compose.smoke.yml'
$dotenvPath = Join-Path $PSScriptRoot '.env'

function Wait-HttpOk([string]$url, [int]$timeoutSec = 90) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSec)
  do {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return $true }
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Read-DotEnv([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }

  foreach ($line in Get-Content $path) {
    $t = $line.Trim()
    if (-not $t) { continue }
    if ($t.StartsWith('#')) { continue }

    $eq = $t.IndexOf('=')
    if ($eq -lt 1) { continue }

    $key = $t.Substring(0, $eq).Trim()
    $value = $t.Substring($eq + 1).Trim()

    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    if ($key) {
      $map[$key] = $value
    }
  }

  return $map
}

Push-Location $repo
try {
  if (-not $SkipChecks) {
    npm run check:all
  }

  $serverVersion = & docker version --format '{{.Server.Version}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $serverVersion) {
    throw 'Docker daemon not reachable. Start Docker Desktop/Engine and re-run this script in an elevated terminal if needed.'
  }

  $files = @($composeBase)
  if ($Mode -eq 'smoke') {
    $files += $composeSmoke
  }

  function Invoke-DockerCompose([string[]]$composeArgs) {
    $args = @('compose')
    foreach ($f in $files) {
      $args += @('-f', $f)
    }
    $args += $composeArgs
    $out = docker @args
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose failed (exit $LASTEXITCODE): docker $($args -join ' ')"
    }
    return $out
  }

  Invoke-DockerCompose @('up', '--build', '-d', '--remove-orphans') | Out-Host

  function Assert-ServiceHealthy([string]$service) {
    $id = (Invoke-DockerCompose @('ps', '-q', $service)).Trim()
    if (-not $id) {
      throw "service not found: $service"
    }
    $info = docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' $id
    if ($LASTEXITCODE -ne 0) {
      throw "docker inspect failed for service: $service"
    }
    if (-not $info.StartsWith('running')) {
      throw "$service is not running: $info"
    }
    if ($info -match 'unhealthy') {
      throw "$service is unhealthy: $info"
    }
  }

  Assert-ServiceHealthy 'backend'
  Assert-ServiceHealthy 'admin-frontend'
  Assert-ServiceHealthy 'frontend'

  if (-not $SkipWait) {
    $dotenv = Read-DotEnv $dotenvPath
    $httpPort = if ($env:HTTP_PORT) { $env:HTTP_PORT } elseif ($dotenv.ContainsKey('HTTP_PORT')) { $dotenv['HTTP_PORT'] } else { '8080' }
    $adminPort = if ($env:ADMIN_PORT) { $env:ADMIN_PORT } elseif ($dotenv.ContainsKey('ADMIN_PORT')) { $dotenv['ADMIN_PORT'] } else { '18081' }

    if (-not (Wait-HttpOk ("http://127.0.0.1:{0}/api/health" -f $httpPort) 120)) { throw 'healthcheck not ready' }
    if (-not (Wait-HttpOk ("http://127.0.0.1:{0}/admin/users" -f $adminPort) 120)) { throw 'admin portal not ready' }

    "RELEASE OK: user=http://127.0.0.1:$httpPort/ admin=http://127.0.0.1:$adminPort/admin/users"
  }
} finally {
  Pop-Location
}
