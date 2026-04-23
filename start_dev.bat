@echo off
chcp 65001 >nul
title TaskTick Development

echo ========================================
echo   TaskTick 一键启动
echo ========================================
echo.

:: Start API service
echo [1/2] Starting API service...
cd /d %~dp0services\api
start "TaskTick API" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: Wait for API to start
timeout /t 3 /nobreak >nul

:: Start frontend
echo [2/2] Starting frontend...
cd /d %~dp0apps\web
start "TaskTick Frontend" cmd /k "pnpm run dev"

echo.
echo ========================================
echo   Done!
echo   - API:   http://127.0.0.1:8000
echo   - Frontend: http://localhost:5173
echo   - Docs:  http://127.0.0.1:8000/docs
echo ========================================
pause
