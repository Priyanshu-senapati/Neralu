# Stage start: everything for a live demo with one command, then a go/no-go check.
#
#   powershell -ExecutionPolicy Bypass -File scripts\stage.ps1            real phone calls (Twilio + ngrok)
#   powershell -ExecutionPolicy Bypass -File scripts\stage.ps1 -Browser   no telecom: calls ring the /phone page
#   add -Pilot to run a real day: real time, rounds start by themselves (PILOT_ROUND_TIMES in backend\.env)
#   add -SkipBuild to reuse the last website build (faster restarts)
#
# The server and ngrok open in their own windows, so they keep running if this one closes.
# Stop everything with scripts\stage-stop.ps1.
param([switch]$Browser, [switch]$SkipBuild, [switch]$Pilot)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host "STOPPED: $text" -ForegroundColor Red; exit 1 }

Step "Stopping anything left over"
& (Join-Path $PSScriptRoot "stage-stop.ps1") -Quiet

if (-not $SkipBuild) {
  Step "Building the website"
  Push-Location frontend
  if (-not (Test-Path "node_modules")) { npm ci; if ($LASTEXITCODE) { Pop-Location; Fail "npm ci failed (see SETUP.md)" } }
  npm run build --silent
  if ($LASTEXITCODE) {
    Write-Host "Build failed; trying once more after reinstalling packages..." -ForegroundColor Yellow
    npm ci; npm run build --silent
    if ($LASTEXITCODE) { Pop-Location; Fail "website build failed (see SETUP.md, Troubleshooting)" }
  }
  Pop-Location
}

$py = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Step "Setting up Python (first run only)"
  $base = if (Get-Command py -ErrorAction SilentlyContinue) { "py -3.11" } else { "python" }
  Invoke-Expression "$base -m venv backend\.venv"
  & $py -m pip install --quiet -r backend\requirements.txt
  & $py -m pip install --quiet -e backend --no-deps
}
if (-not (Test-Path "backend\.env")) { Copy-Item backend\.env.example backend\.env; Write-Host "Created backend\.env from the example: fill in your keys (SETUP.md section 5)" -ForegroundColor Yellow }

# PUBLIC_BASE_URL from backend\.env: the ngrok address Twilio uses, also Priya's link on any network
$publicUrl = (Get-Content backend\.env | Where-Object { $_ -match '^PUBLIC_BASE_URL=' } | Select-Object -First 1) -replace '^PUBLIC_BASE_URL=', '' -replace '\s+#.*$', ''
$publicUrl = $publicUrl.Trim().TrimEnd('/')
$useNgrok = (-not $Browser) -and $publicUrl -match '^https://[^<]+$'

Step "Starting the server (own window: 'Neralu server')"
$modeLine = if ($Browser) { "`$env:TELEPHONY_MODE='browser'; " } else { "" }
if ($Pilot) { $modeLine += "`$env:RUN_MODE='pilot'; " }
$serverCmd = "`$host.UI.RawUI.WindowTitle='Neralu server'; $modeLine Set-Location '$root\backend'; & '$py' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 2"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $serverCmd -WindowStyle Minimized

if ($useNgrok) {
  Step "Starting ngrok (own window: 'Neralu ngrok')"
  $ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
  if (-not $ngrok) { $ngrok = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ngrok.exe" }
  if (-not (Test-Path $ngrok)) { Fail "ngrok is not installed (SETUP.md section 1), or start with -Browser" }
  $domain = $publicUrl -replace '^https://', ''
  $ngrokCmd = "`$host.UI.RawUI.WindowTitle='Neralu ngrok'; & '$ngrok' http --url=$domain 8000"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $ngrokCmd -WindowStyle Minimized
} elseif (-not $Browser) {
  Write-Host "PUBLIC_BASE_URL is not an https address in backend\.env: real calls will fail. Use -Browser or set it." -ForegroundColor Yellow
}

Step "Waiting for the server"
$up = $false
foreach ($i in 1..90) {
  # 127.0.0.1, not localhost: Windows tries IPv6 first and each localhost request costs ~2 s
  try { if ((Invoke-RestMethod -TimeoutSec 5 http://127.0.0.1:8000/health).ok) { $up = $true; break } } catch {}
  Start-Sleep 1
}
if (-not $up) { Fail "the server did not start: open the 'Neralu server' window to read the error" }

if ($useNgrok) {
  Step "Waiting for the public link ($publicUrl)"
  $pub = $false
  foreach ($i in 1..60) {
    # The header skips ngrok's browser notice, which PowerShell's user agent would otherwise get
    try { if ((Invoke-RestMethod -TimeoutSec 8 -Headers @{ "ngrok-skip-browser-warning" = "1" } "$publicUrl/health").ok) { $pub = $true; break } } catch {}
    Start-Sleep 1
  }
  if (-not $pub) { Write-Host "The public link is still not reaching the server: check the 'Neralu ngrok' window (the check below retries)." -ForegroundColor Yellow }
}

Step "Go / no-go"
try {
  # WebClient with UTF-8: Windows PowerShell 5.1 would otherwise misread "·" in the JSON
  $wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
  $status = $wc.DownloadString("http://127.0.0.1:8000/api/status?fresh=1") | ConvertFrom-Json
  foreach ($c in $status.checks) {
    $mark = if (-not $c.ok) { "FAIL" } elseif ($c.warn) { "note" } else { " ok " }
    $color = if (-not $c.ok) { "Red" } elseif ($c.warn) { "Yellow" } else { "Green" }
    Write-Host ("  [{0}] {1,-16} {2}" -f $mark, $c.label, $c.detail) -ForegroundColor $color
  }
  if ($status.ok) { Write-Host "  READY" -ForegroundColor Green } else { Write-Host "  NOT READY: fix the FAIL lines above" -ForegroundColor Red }
} catch { Write-Host "  could not read /api/status: $_" -ForegroundColor Red }

$lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1).IPAddress
$phoneBase = if ($useNgrok) { $publicUrl } elseif ($lan) { "http://${lan}:8000" } else { "http://localhost:8000" }

Write-Host ""
Write-Host "  Ward console      http://localhost:8000/ward"
Write-Host "  Priya (volunteer) $phoneBase/volunteer?token=priya-demo"
Write-Host "  Registration      $phoneBase/register"
Write-Host "  Kamala's family   $phoneBase/family?t=kamala-family   (her son's live status page)"
if ($Browser) { Write-Host "  Kamala's phone    $phoneBase/phone   (open on the phone the judge holds)" }
Write-Host "  Story page        http://localhost:8000/"
if ($useNgrok) { Write-Host "  (Phones opening the ngrok link may see ngrok's notice once: tap 'Visit Site'.)" -ForegroundColor DarkGray }
Write-Host ""
Write-Host "  Stop everything:  powershell -ExecutionPolicy Bypass -File scripts\stage-stop.ps1"
