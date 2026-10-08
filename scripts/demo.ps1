# One command, one port: builds the website and serves it with the API on :8000.
# Phones on the same Wi-Fi open the printed address. Usage (repo root): powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Building the website..."
Push-Location frontend
npm install --silent
npm run build --silent
Pop-Location

if (-not (Test-Path "backend\.venv\Scripts\uvicorn.exe")) {
  Write-Host "Setting up the backend (first run only)..."
  python -m venv backend\.venv
  backend\.venv\Scripts\pip install --quiet -e "backend[dev]"
}

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
& .\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000
