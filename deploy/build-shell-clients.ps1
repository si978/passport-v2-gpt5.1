$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$entryA = Join-Path $repo 'dev' 'shell' 'passport_client_jiuweihu.py'
$entryB = Join-Path $repo 'dev' 'shell' 'passport_client_youlishe.py'

foreach ($p in @($entryA, $entryB)) {
  if (-not (Test-Path $p)) { throw "entry not found: $p" }
}

function Build-One([string]$name, [string]$entry) {
  python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --paths (Join-Path $repo 'dev') `
    --name $name `
    $entry
}

Build-One 'PassportClientJiuweihu' $entryA
Build-One 'PassportClientYoulishe' $entryB

$exeA = Join-Path $repo 'dist' 'PassportClientJiuweihu.exe'
$exeB = Join-Path $repo 'dist' 'PassportClientYoulishe.exe'

if (-not (Test-Path $exeA)) { throw "Build failed, exe not found: $exeA" }
if (-not (Test-Path $exeB)) { throw "Build failed, exe not found: $exeB" }

"Built: $exeA"
"Built: $exeB"
