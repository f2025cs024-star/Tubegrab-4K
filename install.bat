@echo off
title TubeGrab 4K - 1-Click Automated Setup
color 0b
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [!] Setup was interrupted or encountered an error.
    pause
)
