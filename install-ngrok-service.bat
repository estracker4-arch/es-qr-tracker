@echo off
REM Installs the ngrok tunnel as an auto-start Windows service.
REM RIGHT-CLICK this file -> "Run as administrator".

set NGROK="C:\Users\Balaji\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
set CFG="C:\Users\Balaji\AppData\Local\ngrok\ngrok.yml"

echo Stopping any running ngrok...
taskkill /IM ngrok.exe /F >nul 2>&1

echo Installing ngrok service...
%NGROK% service install --config %CFG%

echo Starting ngrok service...
%NGROK% service start

echo.
echo Done. Tunnel: https://tinker-unclothed-debatable.ngrok-free.dev
echo Service auto-starts on every boot now.
pause
