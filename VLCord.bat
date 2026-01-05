@echo off
title VLCord - VLC Discord Rich Presence
echo 🚀 Starting VLCord...
echo.
echo 📋 Prerequisites:
echo   - VLC Media Player installed
echo   - Discord running
echo   - VLC HTTP interface enabled (port 8080, password: vlcpassword)
echo.
echo 🌐 Web interface will be available at: http://localhost:7100
echo 🛑 Press Ctrl+C to stop VLCord
echo.

cd /d "%~dp0"
npm start

echo.
echo VLCord has stopped.
pause
