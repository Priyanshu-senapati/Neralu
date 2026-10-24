# One command, one port: installs what is missing, builds the website and serves it with the API on :8000.
# Safe to run every time: libraries are reinstalled only when requirements.txt or package-lock.json change,
# so a second run works offline. Phones on the same Wi-Fi open the printed address.
# Usage (repo root): powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Fail([string]$msg) { Write-Host "Error: $msg" -ForegroundColor Red; exit 1 }

# Runs a program and stops the script if it fails (PowerShell does not do this for programs by itself).
function Run([string]$exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { Fail "$exe $($argv -join ' ') failed (exit code $LASTEXITCODE)" }
}

# True when the command runs and exits 0. Errors are expected while probing, so they do not stop the script.
function Test-Command([string[]]$cmd) {
  $ErrorActionPreference = "Continue"
  if (-not (Get-Command $cmd[0] -ErrorAction SilentlyContinue)) { return $false }
  $rest = @($cmd | Select-Object -Skip 1)
  & $cmd[0] @rest 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

# $a changed since $b was written (or $b is missing).
function Newer([string]$a, [string]$b) {
  (-not (Test-Path $b)) -or ((Get-Item $a).LastWriteTimeUtc -gt (Get-Item $b).LastWriteTimeUtc)
}

# --- Tools ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js is not installed. Get the 22 LTS from https://nodejs.org" }
$nodeCheck = "const [a,b]=process.versions.node.split('.').map(Number); process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"
if (-not (Test-Command @("node", "-e", $nodeCheck))) {
  Fail "Node $(node --version) is too old. The website needs 20.19+ or 22.12+ (get the 22 LTS from https://nodejs.org)"
}
$portCheck = "require('net').connect(8000,'127.0.0.1').on('connect',()=>process.exit(1)).on('error',()=>process.exit(0))"
if (-not (Test-Command @("node", "-e", $portCheck))) {
  Fail "Port 8000 is already in use: Neralu is probably running in another window. Stop it there with Ctrl+C, then run this again."
}

# --- Backend: exact versions from backend\requirements.txt ---
$venvPy = Join-Path $PWD "backend\.venv\Scripts\python.exe"
$pyCheck = "import sys; sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) else 1)"
if (-not (Test-Path $venvPy)) {
  $py = $null
  foreach ($candidate in @(@("py", "-3.11"), @("py", "-3.12"), @("py", "-3.13"), @("python"))) {
    if (Test-Command ($candidate + @("-c", $pyCheck))) { $py = $candidate; break }
  }
  if (-not $py) { Fail "Python 3.11, 3.12 or 3.13 is needed (https://www.python.org/downloads/, tick 'Add python.exe to PATH')" }
  Write-Host "Creating the backend environment with $($py -join ' ') (first run only)..."
  Run $py[0] (@($py | Select-Object -Skip 1) + @("-m", "venv", "backend\.venv"))
}
$stamp = "backend\.venv\.neralu-requirements"
if ((Newer "backend\requirements.txt" $stamp) -or (Newer "backend\pyproject.toml" $stamp)) {
  Write-Host "Installing backend libraries (exact versions)..."
  if (Test-Command @($venvPy, "-m", "pip", "--version")) {
    Run $venvPy @("-m", "pip", "install", "--quiet", "-r", "backend\requirements.txt")
    Run $venvPy @("-m", "pip", "install", "--quiet", "-e", "backend", "--no-deps")
  } elseif (Get-Command uv -ErrorAction SilentlyContinue) {  # a venv made by uv has no pip
    Run "uv" @("pip", "install", "--quiet", "--python", $venvPy, "-r", "backend\requirements.txt")
    Run "uv" @("pip", "install", "--quiet", "--python", $venvPy, "-e", "backend", "--no-deps")
  } else {
    Fail "backend\.venv has no pip. Delete the backend\.venv folder and run this again."
  }
  New-Item -ItemType File -Force $stamp | Out-Null
}
if (-not (Test-Path "backend\.env")) {
  Copy-Item "backend\.env.example" "backend\.env"
  Write-Host "Created backend\.env. For real calls fill in the Twilio settings (SETUP.md section 5);"
  Write-Host "without Twilio, set TELEPHONY_MODE=browser to ring the /phone page instead."
}

# --- Website: exact versions from frontend\package-lock.json ---
Push-Location frontend
if (Newer "package-lock.json" "node_modules\.package-lock.json") {
  Write-Host "Installing website libraries (exact versions)..."
  Run "npm" @("ci", "--no-audit", "--no-fund")
}
Write-Host "Building the website..."
Run "npm" @("run", "build", "--silent")
Pop-Location

$lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "  Neralu is running"
Write-Host "  On this laptop:    http://localhost:8000"
if ($lan) { Write-Host "  On phones (Wi-Fi): http://${lan}:8000" }
Write-Host "  Stop with Ctrl+C"
Write-Host ""
Set-Location backend
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 2
