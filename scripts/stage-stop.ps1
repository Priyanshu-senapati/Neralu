# Stops the Neralu server (port 8000), the website dev server (port 5180) and ngrok.
#   powershell -ExecutionPolicy Bypass -File scripts\stage-stop.ps1
param([switch]$Quiet)

$stopped = @()
foreach ($port in 8000, 5180) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop; $stopped += "port $port" } catch {}
  }
}
Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; $stopped += "ngrok" } catch {}
}
# Close the windows stage.ps1 opened, so restarts do not pile them up.
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -in "Neralu server", "Neralu ngrok" } |
  ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }
Start-Sleep -Milliseconds 500
if (-not $Quiet) {
  if ($stopped) { Write-Host ("Stopped: " + (($stopped | Select-Object -Unique) -join ", ")) } else { Write-Host "Nothing was running." }
}
