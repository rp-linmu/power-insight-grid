@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "CRAWLER_DIR=%PROJECT_ROOT%gd-market-crawler"
if "%PYTHON_EXE%"=="" set "PYTHON_EXE=python"

if /i "%PYTHON_EXE%"=="python" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python executable not found. Install Python or set PYTHON_EXE to a full python.exe path.
    exit /b 1
  )
) else (
  if not exist "%PYTHON_EXE%" (
    echo Python executable not found: %PYTHON_EXE%
    exit /b 1
  )
)

if not exist "%BACKEND_DIR%\app\main.py" (
  echo Backend app not found: %BACKEND_DIR%\app\main.py
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo Frontend package.json not found: %FRONTEND_DIR%\package.json
  exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo Frontend dependencies are missing.
  echo Run: cd /d "%FRONTEND_DIR%" ^&^& npm.cmd install
  exit /b 1
)

start "ECsystem Backend 8001" cmd /k "cd /d "%BACKEND_DIR%" && "%PYTHON_EXE%" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001"
start "ECsystem Frontend 3000" cmd /k "cd /d "%FRONTEND_DIR%" && npm.cmd run dev"

if exist "%CRAWLER_DIR%\config.local.json" (
  start "ECsystem Crawler 8787" cmd /k "cd /d "%CRAWLER_DIR%" && node src/index.js web --config config.local.json --port 8787"
) else (
  echo Crawler config.local.json is missing; crawler service skipped.
)

echo Backend:  http://127.0.0.1:8001
echo Frontend: http://127.0.0.1:3000
endlocal
