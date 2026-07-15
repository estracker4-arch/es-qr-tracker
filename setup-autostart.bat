@echo off
:: Run this ONCE as Administrator to set up auto-start
setlocal

set SCRIPT_DIR=%~dp0

echo [1/4] Installing PM2 globally...
call npm install -g pm2

echo [2/4] Installing pm2-windows-startup...
call npm install -g pm2-windows-startup
call pm2-startup install

echo [3/4] Building frontend (first time)...
call "%SCRIPT_DIR%build-prod.bat"
if errorlevel 1 exit /b 1

echo [4/4] Starting app and saving PM2 process list...
cd /d "%SCRIPT_DIR%"
call pm2 start ecosystem.config.js
call pm2 save

echo.
echo ============================
echo Auto-start setup complete.
echo Backend runs on http://localhost:3001
echo Next: set up Tailscale Funnel (see instructions below)
echo ============================
