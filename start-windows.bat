@echo off
REM Arachnide SEO Spider - double-click launcher for Windows
cd /d "%~dp0"
set NODE_OPTIONS=
where node 1>NUL 2>NUL
if errorlevel 1 (
  echo Node.js is not installed. Please install the LTS version from https://nodejs.org
  echo Node.js n est pas installe. Installez la version LTS depuis https://nodejs.org
  echo Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren.
  start "" https://nodejs.org
  pause
  exit /b 1
)
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  pause
  exit /b 1
)
set ARACHNIDE_OPEN=1
call npm start
pause
