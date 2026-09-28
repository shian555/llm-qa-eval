@echo off
rem ============================================================
rem  一键启动（生产模式）：FastAPI 托管前端构建产物 + REST API
rem  地址：http://127.0.0.1:8000
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0.."
set PYTHONUTF8=1

if not exist "web\dist\index.html" (
    echo [!] 未找到 web\dist 构建产物，请先执行：
    echo     cd web
    echo     npm install
    echo     npm run build
    pause
    exit /b 1
)

echo [*] 启动 LLM QA 评测平台: http://127.0.0.1:8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
