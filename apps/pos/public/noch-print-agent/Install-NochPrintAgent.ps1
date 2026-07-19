param(
  [string]$PrinterName = 'XP-N200L',
  [int]$Port = 18181
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer as Administrator.'
}

$sourceAgent = Join-Path $PSScriptRoot 'Noch-PrintAgent.ps1'
if (-not (Test-Path -LiteralPath $sourceAgent)) {
  throw 'Noch-PrintAgent.ps1 must be in the same folder as this installer.'
}

$installedPrinters = @(Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name)
if ($PrinterName -eq 'XP-N200L' -and $PrinterName -notin $installedPrinters) {
  $xprinter = $installedPrinters | Where-Object { $_ -match 'XP.?N200L|XPrinter|POS.?80' } | Select-Object -First 1
  if ($xprinter) { $PrinterName = $xprinter }
}
if ($PrinterName -notin $installedPrinters) {
  Write-Host 'Installed Windows printers:' -ForegroundColor Yellow
  $installedPrinters | ForEach-Object { Write-Host "  $_" }
  throw "Printer '$PrinterName' was not found. Install the XPrinter Windows driver, then rerun with -PrinterName followed by the exact Windows printer name."
}

$installDir = Join-Path $env:ProgramData 'NochPrintAgent'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
$installedAgent = Join-Path $installDir 'Noch-PrintAgent.ps1'
Copy-Item -LiteralPath $sourceAgent -Destination $installedAgent -Force

$currentUser = "$env:USERDOMAIN\$env:USERNAME"
& netsh http delete urlacl url="http://127.0.0.1:$Port/" 2>$null | Out-Null
& netsh http add urlacl url="http://127.0.0.1:$Port/" user="$currentUser" | Out-Null

$taskName = 'Noch Bloom Print Agent'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$installedAgent`" -PrinterName `"$PrinterName`" -Port $Port"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 2
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Headers @{ Origin = 'https://apps.noch.cloud'; 'X-Noch-Print-Agent' = '1' }
if (-not $health.printer_available) { throw "Agent started, but printer '$PrinterName' is unavailable." }

Write-Host "Noch Print Agent installed for '$PrinterName'." -ForegroundColor Green
Write-Host 'Open apps.noch.cloud > Bloom POS > Settings > Printer Setup, then select Windows USB.'
