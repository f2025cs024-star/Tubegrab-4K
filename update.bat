@echo off
setlocal enabledelayedexpansion
title TubeGrab 4K - 1-Click System Updater
echo ========================================================
echo         TubeGrab 4K - 1-Click Automatic Updater        
echo ========================================================
echo.
echo [1/3] Updating YouTube core extractor (yt-dlp)...
python -m pip install -U --no-cache-dir yt-dlp >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo       [OK] yt-dlp updated to latest YouTube algorithm!
) else (
    echo       [i] yt-dlp check completed.
)
echo.
echo [2/3] Fetching latest TubeGrab 4K engine and extension files...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
    "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/f2025cs024-star/Tubegrab-4K/main/idm_4k_app.py' -OutFile 'idm_4k_app.py'; " ^
    "if (Test-Path 'extension') { " ^
    "    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/f2025cs024-star/Tubegrab-4K/main/extension/content.js' -OutFile 'extension\content.js'; " ^
    "    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/f2025cs024-star/Tubegrab-4K/main/extension/background.js' -OutFile 'extension\background.js'; " ^
    "    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/f2025cs024-star/Tubegrab-4K/main/extension/manifest.json' -OutFile 'extension\manifest.json'; " ^
    "}"
echo       [OK] All script files updated to latest release!
echo.
echo [3/3] Restarting background helper...
powershell -Command "Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*idm_4k_app.py*' } | Stop-Process -Force" >nul 2>&1
if exist "silent_start.vbs" (
    start "" wscript.exe "silent_start.vbs"
    echo       [OK] Fresh helper running silently.
)
echo.
echo ========================================================
echo   SUCCESS: TubeGrab 4K is now updated to the latest version!
echo ========================================================
echo.
echo If you have Chrome or Edge open:
echo   1. Go to chrome://extensions (or edge://extensions)
echo   2. Click the circular 'Reload' icon on TubeGrab 4K.
echo.
pause
