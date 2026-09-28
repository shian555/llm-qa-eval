"""数据集管理：JSONL 单一事实源的读取、增删改、一键重生成。

按 type 强校验字段，保证 tests/test_eval.py（import 期读 jsonl）与 CI 不被弄崩；
写前自动备份到 data/eval.backup.jsonl；有运行进行中时拒绝写入（运行已快照）。
"""
from __future__ import annotations

import json
import shutil
from collections import Counter

from fastapi import APIRouter, HTTPException, Query

from run_eval import load_eval_set
from scripts.gen_eval_set import build  # 复用生成器，保证与 CI 同源

from ..config import DATA_BACKUP, DATA_FILE
from ..instance import instance
from ..schemas import DatasetItemReq

router = APIRouter(prefix="/api/dataset", tags=["dataset"])

VALID_TYPES = ("normal", "inject", "hallucination")


def _require_idle() -> None:
    if instance.runner.running_id:
        raise HTTPException(status_code=409,
                            detail="有评测正在运行，数据集暂不可修改（运行使用开始时的快照）")


def _load() -> list[dict]:
    if not DATA_FILE.is_file():
        return []
    return load_eval_set(DATA_FILE)


def _write(items: list[dict]) -> None:
    if DATA_FILE.is_file():
        shutil.copyfile(DATA_FILE, DATA_BACKUP)  # 覆盖前备份上一版
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")


def _is_modified() -> bool:
    """当前文件内容是否偏离生成器输出（手工编辑过 -> 前端显示徽标）。"""
    if not DATA_FILE.is_file():
        return False
    actual = DATA_FILE.read_text(encoding="utf-8").strip()
    expected = "\n".join(json.dumps(it, ensure_ascii=False) for it in build()).strip()
    return actual != expected


def _validate(req: DatasetItemReq) -> dict:
    if req.type not in VALID_TYPES:
        raise HTTPException(status_code=400,
                            detail="type 必须是 normal / inject / hallucination")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question 不能为空")
    item: dict = {"question": req.question.strip(), "type": req.type}
    if req.type == "normal":
        if not (req.answer or "").strip():
            raise HTTPException(status_code=400, detail="normal 用例必须提供 answer（标准答案）")
        keywords = [k.strip() for k in (req.keywords or []) if k.strip()]
        docs = [d.strip() for d in (req.docs or []) if d.strip()]
        if not keywords or not docs:
            raise HTTPException(status_code=400,
                                detail="normal 用例必须提供非空 keywords 与 docs（检索金标）")
        item["answer"] = req.answer.strip()
        item["keywords"] = keywords
        item["docs"] = docs
    return item


@router.get("")
def get_dataset(type: str | None = None, q: str | None = None,
                page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200)):
    items = _load()
    stats = Counter(it.get("type") for it in items)
    indexed = list(enumerate(items))
    if type:
        indexed = [(i, it) for i, it in indexed if it.get("type") == type]
    if q:
        kw = q.lower()
        indexed = [(i, it) for i, it in indexed if kw in (it.get("question") or "").lower()]
    start = (page - 1) * page_size
    return {
        "total": len(indexed),
        "all_total": len(items),
        "stats": {t: stats.get(t, 0) for t in VALID_TYPES},
        "modified": _is_modified(),
        "items": [{"index": i, **it} for i, it in indexed[start:start + page_size]],
    }


@router.post("", status_code=201)
def add_item(req: DatasetItemReq):
    _require_idle()
    item = _validate(req)
    items = _load()
    items.append(item)
    _write(items)
    return {"index": len(items) - 1, **item}


@router.put("/{index}")
def update_item(index: int, req: DatasetItemReq):
    _require_idle()
    items = _load()
    if not 0 <= index < len(items):
        raise HTTPException(status_code=404, detail=f"用例不存在：index={index}")
    items[index] = _validate(req)
    _write(items)
    return {"index": index, **items[index]}


@router.delete("/{index}")
def delete_item(index: int):
    _require_idle()
    items = _load()
    if not 0 <= index < len(items):
        raise HTTPException(status_code=404, detail=f"用例不存在：index={index}")
    removed = items.pop(index)
    _write(items)
    return {"removed_index": index, "question": removed.get("question"), "total": len(items)}


@router.post("/regenerate")
def regenerate():
    _require_idle()
    items = build()
    _write(items)
    stats = Counter(it["type"] for it in items)
    return {"total": len(items),
            "stats": {t: stats.get(t, 0) for t in VALID_TYPES},
            "modified": False}
