@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Node.js is required. Download from https://nodejs.org/
  pause
  exit /b 1
)
echo Installing dependencies (first run may take a minute)...
call npm install
start "" http://localhost:3000
call npm run dev
