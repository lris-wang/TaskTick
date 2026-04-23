@echo off
chcp 65001 >nul
title TaskTick 开发环境

echo ========================================
echo   TaskTick 一键启动
echo ========================================
echo.

:: 启动 API 服务
echo [1/2] 启动 API 服务...
cd /d %~dp0services\api
start "TaskTick API" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: 等待 API 启动
timeout /t 2 /nobreak >nul

:: 启动前端
echo [2/2] 启动前端...
cd /d %~dp0apps\web
start "TaskTick 前端" cmd /k "pnpm run dev"

echo.
echo ========================================
echo   启动完成！
echo   - API: http://127.0.0.1:8000
echo   - 前端: http://localhost:5173
echo   - 文档: http://127.0.0.1:8000/docs
echo ========================================
echo.
echo 提示：关闭窗口即可停止服务
pause
