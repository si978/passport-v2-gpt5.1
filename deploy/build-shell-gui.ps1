$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$entry = Join-Path $repo 'dev' 'shell' 'passport_shell_gui.py'
if (-not (Test-Path $entry)) { throw "entry not found: $entry" }

python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --paths (Join-Path $repo 'dev') `
  --name PassportShellDemo `
  $entry

$exe = Join-Path $repo 'dist' 'PassportShellDemo.exe'
if (Test-Path $exe) {
  "Built: $exe"
} else {
  throw "Build failed, exe not found: $exe"
}
