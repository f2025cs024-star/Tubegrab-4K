@echo off
title TubeGrab 4K - 1-Click Automated Setup
color 0b
echo ========================================================
echo         TubeGrab 4K - Easy Setup for Windows
echo ========================================================
echo.
cd /d "%~dp0"

:: 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Python is not installed or not in PATH!
    echo     Please install Python 3.10+ from https://www.python.org/downloads/
    echo     (IMPORTANT: Check "Add Python to PATH" during installation)
    echo.
    pause
    exit /b 1
)

echo [1/4] Python detected successfully!
echo [2/4] Installing required dependencies (FastAPI, yt-dlp, FFmpeg, curl_cffi)...
python -m pip install -q -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] Retrying pip install...
    pip install -r requirements.txt
)

echo [3/4] Creating Windows Auto-Start and Desktop Shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sh = New-Object -ComObject WScript.Shell;" ^
  "$vbs = Join-Path (Get-Location).Path 'silent_start.vbs';" ^
  "$startup = [Environment]::GetFolderPath('Startup');" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$lnk1 = $sh.CreateShortcut(\"$startup\TubeGrab_4K.lnk\");" ^
  "$lnk1.TargetPath = 'wscript.exe';" ^
  "$lnk1.Arguments = \"`\"$vbs`\"\";" ^
  "$lnk1.WorkingDirectory = (Get-Location).Path;" ^
  "$lnk1.WindowStyle = 7;" ^
  "$lnk1.Save();" ^
  "$lnk2 = $sh.CreateShortcut(\"$desktop\TubeGrab 4K Helper.lnk\");" ^
  "$lnk2.TargetPath = 'wscript.exe';" ^
  "$lnk2.Arguments = \"`\"$vbs`\"\";" ^
  "$lnk2.WorkingDirectory = (Get-Location).Path;" ^
  "$lnk2.Save();" ^
  "$reg = 'HKCU:\Software\Classes\tubegrab';" ^
  "New-Item -Path $reg -Force | Out-Null;" ^
  "Set-ItemProperty -Path $reg -Name '(Default)' -Value 'URL:TubeGrab Protocol';" ^
  "Set-ItemProperty -Path $reg -Name 'URL Protocol' -Value '';" ^
  "New-Item -Path \"$reg\shell\open\command\" -Force | Out-Null;" ^
  "Set-ItemProperty -Path \"$reg\shell\open\command\" -Name '(Default)' -Value \"wscript.exe `\"$vbs`\"\";"

echo [4/4] Starting TubeGrab 4K silent background helper...
wscript.exe "%~dp0silent_start.vbs"

echo.
echo ========================================================
echo   SUCCESS! TubeGrab 4K is installed and running!
echo ========================================================
echo.
echo NEXT STEP: Load the extension in Chrome:
echo   1. Open Google Chrome and go to: chrome://extensions
echo   2. Turn ON "Developer mode" (toggle in top-right corner)
echo   3. Click "Load unpacked" (button in top-left corner)
echo   4. Select the "extension" folder inside this directory:
echo      %~dp0extension
echo.
echo That's it! Open any YouTube video and download in 4K/1080p!
echo ========================================================
pause
