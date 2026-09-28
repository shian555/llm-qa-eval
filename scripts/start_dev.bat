@echo off
rem ============================================================
rem  开发模式：FastAPI(8000) + Vite 热更新(5173)
rem  访问 http://localhost:5173（/api 自动代理到 8000）
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0.."
set PYTHONUTF8=1

start "backend" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
start "frontend" cmd /k "cd web && npm run dev"
echo [*] 已在两个窗口分别启动后端(8000)与前端(5173)...
