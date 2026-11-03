@echo off
title IDM 4K Turbo Downloader Service
cd /d "%~dp0"
taskkill /F /IM pythonw.exe /FI "WINDOWTITLE eq IDM 4K*" 2>nul
start "IDM 4K Turbo Downloader" /B python "%~dp0idm_4k_app.py" %*
echo.
echo ========================================================
echo   IDM 4K Turbo YouTube Downloader is RUNNING!
echo   - Download Destination: Downloads folder
echo   - Just click "Download this video" or press Alt+D on YouTube!
echo ========================================================
timeout /t 3 >nul
