@echo off
setlocal

set "INSTALLER=%~dp0Install-NochPrintAgent.ps1"
if not exist "%INSTALLER%" (
  echo Missing Install-NochPrintAgent.ps1. Keep this file in the extracted Noch Print Agent folder.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ''%INSTALLER%'''; exit $process.ExitCode"
if errorlevel 1 (
  echo Installation did not finish. Make sure Windows allowed the administrator prompt.
  pause
  exit /b 1
)

echo.
echo Bloom printer setup is complete. Return to Bloom POS and select Windows USB.
pause
