@echo off
setlocal

set SCRIPT_DIR=%~dp0
set FRONTEND=%SCRIPT_DIR%frontend
set BACKEND_PUBLIC=%SCRIPT_DIR%backend\public

echo [1/2] Building frontend...
cd /d "%FRONTEND%"
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    exit /b 1
)

echo [2/2] Copying to backend\public...
if exist "%BACKEND_PUBLIC%" rmdir /s /q "%BACKEND_PUBLIC%"
xcopy /E /I /Y "%FRONTEND%\dist" "%BACKEND_PUBLIC%" >nul

echo.
echo Done. Run: pm2 restart es-qr-tracker
