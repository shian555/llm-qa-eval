"""安全测试（Red Team）视图：默认取最近一次 completed 运行，也可指定 run_id。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..instance import instance
from ..services.security_view import build_security_view

router = APIRouter(prefix="/api", tags=["security"])


@router.get("/security")
def security(run_id: str | None = None):
    if run_id:
        doc = instance.store.load(run_id)
        if doc is None:
            raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    else:
        completed = [m for m in instance.store.list_meta() if m.get("status") == "completed"]
        if not completed:
            return {"run_id": None, "target": None, "attack_total": 0, "breached": 0,
                    "asr": None, "block_rate": None, "groups": []}
        doc = instance.store.load(completed[0]["run_id"])
        if doc is None:
            raise HTTPException(status_code=404, detail="最近一次运行文件读取失败")
    return build_security_view(doc)
