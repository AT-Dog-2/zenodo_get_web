@echo off
chcp 65001 >nul
echo ========================================
echo    Zenodo Downloader Web Interface
echo ========================================
echo.

cd /d "%~dp0"

REM Stop any existing server on port 5001 to avoid stale instances
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001" ^| findstr "LISTENING"') do (
    echo Stopping old server process PID %%a ...
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting web server...
echo.
echo After the server starts, open your browser and visit:
echo http://127.0.0.1:5001
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe -m zenodo_get.web
) else (
    echo Virtual environment not found. Installing dependencies...
    uv sync
    .venv\Scripts\python.exe -m zenodo_get.web
)

pause
