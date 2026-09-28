"""FastAPI 应用入口：API 路由 + SPA 静态托管。

启动（项目根目录）：
    uvicorn app.main:app --host 127.0.0.1 --port 8000

生产模式下 web/dist 由本服务托管：/api/* 走接口，其余路径优先返回静态文件、
否则回退 index.html（React Router 深链接不 404）。
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import APP_VERSION, WEB_DIST
from .instance import instance
from .routers import dataset, overview, playground, runs, security, system


def create_app() -> FastAPI:
    instance.init()  # 初始化存储（含 legacy 迁移与中断恢复）
    app = FastAPI(
        title="LLM QA Eval 评测平台",
        version=APP_VERSION,
        description="大模型问答系统三维质量评测 + 安全鲁棒性测试可视化平台",
    )
    app.add_middleware(CORSMiddleware, allow_origins=["*"],
                       allow_methods=["*"], allow_headers=["*"])

    for r in (overview.router, runs.router, dataset.router,
              security.router, playground.router, system.router):
        app.include_router(r)

    if WEB_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            candidate = (WEB_DIST / full_path).resolve()
            if full_path and candidate.is_file() \
                    and str(candidate).startswith(str(WEB_DIST.resolve())):
                return FileResponse(candidate)
            return FileResponse(WEB_DIST / "index.html")

    return app


app = create_app()
