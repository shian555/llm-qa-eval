"""评测运行：发起 / 历史 / 详情 / 明细 / 进度 / 取消 / 删除 / 对比。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..instance import instance
from ..runner import ConflictError
from ..schemas import CompareReq, RunCreateReq
from ..services.compare import diff_runs

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("")
def list_runs(status: str | None = None, target: str | None = None,
              page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    metas = instance.store.list_meta()
    if status:
        metas = [m for m in metas if m.get("status") == status]
    if target:
        metas = [m for m in metas if (m.get("target") or {}).get("id") == target]
    start = (page - 1) * page_size
    return {"total": len(metas), "page": page, "page_size": page_size,
            "running_id": instance.runner.running_id,
            "items": metas[start:start + page_size]}


@router.get("/running")  # 固定路径须先于 /{run_id} 注册
def running():
    rid = instance.runner.running_id
    return {"run_id": rid, "status": instance.runner.status(rid) if rid else None}


@router.post("", status_code=202)
def create_run(req: RunCreateReq):
    try:
        run_id = instance.runner.start(req.target_id, note=req.note, timeout_s=req.timeout_s)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=400, detail=f"未知被测对象：{req.target_id}")
    return {"run_id": run_id, "status": "running"}


@router.post("/compare")  # 固定路径须先于 /{run_id} 注册
def compare(req: CompareReq):
    doc_a = instance.store.load(req.a)
    doc_b = instance.store.load(req.b)
    if doc_a is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{req.a}")
    if doc_b is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{req.b}")
    if doc_a.get("status") != "completed" or doc_b.get("status") != "completed":
        raise HTTPException(status_code=400, detail="只能对比已完成的运行")
    return diff_runs(doc_a, doc_b)


@router.get("/{run_id}")
def get_run(run_id: str):
    doc = instance.store.load(run_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    return {k: v for k, v in doc.items() if k != "items"}


@router.get("/{run_id}/status")
def run_status(run_id: str):
    s = instance.runner.status(run_id)
    if s is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    return s


@router.get("/{run_id}/items")
def run_items(run_id: str, type: str | None = None, passed: bool | None = None,
              q: str | None = None,
              page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200)):
    doc = instance.store.load(run_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    items = doc.get("items") or []
    if type:
        items = [it for it in items if it.get("type") == type]
    if passed is not None:
        items = [it for it in items if bool(it.get("passed")) == passed]
    if q:
        kw = q.lower()
        items = [it for it in items if kw in (it.get("question") or "").lower()]
    start = (page - 1) * page_size
    lite = [{k: v for k, v in it.items() if k != "contexts"}
            for it in items[start:start + page_size]]
    return {"total": len(items), "page": page, "page_size": page_size, "items": lite}


@router.get("/{run_id}/items/{index}")
def run_item(run_id: str, index: int):
    doc = instance.store.load(run_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    for it in doc.get("items") or []:
        if it.get("index") == index:
            return it
    raise HTTPException(status_code=404, detail=f"用例不存在：index={index}")


@router.post("/{run_id}/cancel")
def cancel_run(run_id: str):
    if instance.runner.cancel(run_id):
        return {"cancelled": True, "status": "cancelling"}
    s = instance.runner.status(run_id)
    if s is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    return {"cancelled": False, "status": s["status"]}


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: str):
    if instance.runner.running_id == run_id:
        raise HTTPException(status_code=409, detail="该运行正在进行中，请先取消再删除")
    if not instance.store.delete(run_id):
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
