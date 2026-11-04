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

echo [1/3] Python detected successfully!
echo [2/3] Installing dependencies (FastAPI, yt-dlp, FFmpeg)...
python -m pip install -q -r requirements.txt

echo [3/3] Registering TubeGrab background auto-start protocol...
reg add "HKCU\Software\Classes\tubegrab" /ve /f /d "URL:TubeGrab Protocol" >nul
reg add "HKCU\Software\Classes\tubegrab" /v "URL Protocol" /f /d "" >nul
reg add "HKCU\Software\Classes\tubegrab\shell\open\command" /ve /f /d "wscript.exe \"%~dp0silent_start.vbs\"" >nul

:: Start background helper
wscript.exe "%~dp0silent_start.vbs"

echo.
echo ========================================================
echo   SUCCESS! TubeGrab 4K is registered and running!
echo ========================================================
echo.
echo Registered Folder: %~dp0
echo.
echo You can now download in 4K on YouTube with synced audio!
echo ========================================================
echo.
pause
