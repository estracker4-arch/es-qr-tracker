@echo off
setlocal enabledelayedexpansion
title ES QR Tracker - Install

set ROOT=%~dp0
cd /d "%ROOT%"

echo ============================================
echo   ES QR Tracker - One-Shot Installer
echo ============================================
echo.

REM ---------- [0/6] Prerequisite check ----------
echo [0/6] Checking prerequisites...

where node >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Node.js not found. Install it:  winget install OpenJS.NodeJS.LTS
    goto :fail
)
for /f "delims=" %%v in ('node -v') do echo   Node.js  %%v

where docker >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Docker not found. Install it:  winget install Docker.DockerDesktop
    goto :fail
)
docker info >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Docker is installed but not running. Start Docker Desktop, wait for
    echo          "Engine running", then re-run this script.
    goto :fail
)
echo   Docker   running

where pm2 >nul 2>&1
if errorlevel 1 (
    echo   pm2 not found - installing globally...
    call npm install -g pm2
    if errorlevel 1 ( echo   ERROR: pm2 install failed. & goto :fail )
)
echo   pm2      ok
echo.

REM ---------- [1/6] Backend .env ----------
echo [1/6] Backend config...
if exist "%ROOT%backend\.env" (
    echo   backend\.env already exists - keeping it.
) else (
    REM DB host port is 5435 per docker-compose.yml ( 5435:5432 )
    set "SECRET=%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%"
    (
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5435/es_qr_tracker
        echo JWT_SECRET=!SECRET!
        echo PORT=3001
    ) > "%ROOT%backend\.env"
    echo   Created backend\.env with a random JWT_SECRET.
)
echo.

REM ---------- [2/6] npm install ----------
echo [2/6] Installing dependencies (this can take a few minutes)...
echo   - backend
cd /d "%ROOT%backend"  & call npm install || goto :fail
echo   - frontend
cd /d "%ROOT%frontend" & call npm install || goto :fail
if exist "%ROOT%site\package.json" (
    echo   - site
    cd /d "%ROOT%site" & call npm install || goto :fail
)
cd /d "%ROOT%"
echo.

REM ---------- [3/6] Start database ----------
echo [3/6] Starting Postgres container...
docker compose up -d || goto :fail
echo   Waiting for database to accept connections...
set /a TRIES=0
:waitdb
docker compose exec -T db pg_isready -U postgres >nul 2>&1
if not errorlevel 1 goto :dbready
set /a TRIES+=1
if !TRIES! GEQ 30 (
    echo   ERROR: database not ready after 60s. Check: docker compose logs db
    goto :fail
)
timeout /t 2 /nobreak >nul
goto :waitdb
:dbready
echo   Database ready.
echo.

REM ---------- [4/6] Build site + frontend ----------
echo [4/6] Building...
if exist "%ROOT%site\package.json" (
    echo   - marketing site
    cd /d "%ROOT%site" & call npm run build || goto :fail
    cd /d "%ROOT%"
)
echo   - frontend + copy to backend\public
call "%ROOT%build-prod.bat" || goto :fail
echo.

REM ---------- [5/6] Start app ----------
echo [5/6] Starting app under pm2...
call pm2 delete es-qr-tracker >nul 2>&1
call pm2 start "%ROOT%ecosystem.config.js" || goto :fail
call pm2 save
echo.

REM ---------- [6/6] Done ----------
echo [6/6] Verifying...
call pm2 list
echo.
echo ============================================
echo   Install complete.
echo   Open:  http://localhost:3001
echo   LAN:   http://[this-PC-IP]:3001
echo.
echo   Auto-start on boot:  setup-autostart.bat
echo   Internet (ngrok):    install-ngrok-service.bat  (Run as admin)
echo ============================================
goto :end

:fail
echo.
echo ***** INSTALL FAILED - see error above. *****
exit /b 1

:end
endlocal
