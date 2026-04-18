@echo off
REM Deployment script for noch.cloud to Hostinger VPS
REM Prerequisites: WinSCP must be installed

setlocal enabledelayedexpansion

set HOST=72.60.203.107
set USER=root
set PASS=9@hW@s3UWL@Z#9uIUlnp
set TARGET=/var/www/html

echo.
echo ================================
echo Noch.cloud Deployment Script
echo ================================
echo.
echo This script will:
echo 1. Build the app (if needed)
echo 2. Create deployment ZIP
echo 3. Upload to Hostinger via SFTP
echo 4. Extract and cleanup
echo.

REM Check if WinSCP is installed
if not exist "C:\Program Files\WinSCP\WinSCP.com" (
    if not exist "C:\Program Files (x86)\WinSCP\WinSCP.com" (
        echo ERROR: WinSCP not found. Please install from https://winscp.net
        echo.
        pause
        exit /b 1
    )
)

REM Ensure we have the deploy zip
if not exist "noch-deploy.zip" (
    echo Building app...
    call npm run build

    echo Creating deployment ZIP...
    cd dist
    powershell -Command "Compress-Archive -Path * -DestinationPath '..\noch-deploy.zip' -Force"
    cd ..
)

echo.
echo Uploading to noch.cloud (%HOST%)...
echo.

REM Use WinSCP to upload
powershell -Command "& 'C:\Program Files\WinSCP\WinSCP.com' /ini=nul /command \"open sftp://%USER%:%PASS%@%HOST%\" \"cd %TARGET%\" \"put noch-deploy.zip\" \"exit\""

if errorlevel 1 (
    echo.
    echo ERROR: Upload failed. Please ensure WinSCP is installed.
    pause
    exit /b 1
)

echo.
echo ================================
echo Deployment Complete!
echo ================================
echo.
echo Next steps:
echo 1. SSH into the server and run:
echo    unzip /var/www/html/noch-deploy.zip
echo    rm /var/www/html/noch-deploy.zip
echo 2. Visit: http://noch.cloud:3000
echo.
echo Server: 72.60.203.107
echo SSH: root@72.60.203.107
echo Password: (the SSH password you have)
echo.
pause
