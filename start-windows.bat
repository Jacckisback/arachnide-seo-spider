@echo off
REM Arachnide SEO Spider - double-click launcher for Windows
cd /d "%~dp0"
set NODE_OPTIONS=
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install the LTS version from https://nodejs.org
  echo Node.js n est pas installe. Installez la version LTS depuis https://nodejs.org
  echo Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:4000"
call npm start
pause
