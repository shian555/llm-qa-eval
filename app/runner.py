"""评测执行器：单飞并发控制、后台线程执行、协作式取消、轻量进度。

进度只存内存、终态才落盘（避免每条用例写盘）；服务重启丢失进行中进度属预期，
落盘残留由 RunStore._mark_interrupted 兜底标记。
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from run_eval import load_eval_set

from .config import DATA_FILE, SCHEMA_VERSION, sha1_of_file
from .registry import build_target, get_target_meta
from .services.evaluate import evaluate_item_detail, summarize_run
from .store import RunStore


class ConflictError(Exception):
    """已有评测正在运行。"""


def new_run_id() -> str:
    return "r-" + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + os.urandom(2).hex()


@dataclass
class LiveState:
    total: int
    done: int = 0
    current_question: Optional[str] = None
    started_at: float = field(default_factory=time.perf_counter)
    cancel: threading.Event = field(default_factory=threading.Event)


class EvalRunner:
    """同一时刻只允许一个评测运行（单机演示场景足够，且避免资源争抢）。"""

    def __init__(self, store: RunStore):
        self._store = store
        self._live: dict[str, LiveState] = {}
        self._single = threading.Lock()

    @property
    def running_id(self) -> Optional[str]:
        return next(iter(self._live), None)

    def start(self, target_id: str, note: str | None = None, timeout_s: int = 30) -> str:
        if not self._single.acquire(blocking=False):
            raise ConflictError("已有评测正在运行，请等待完成或先取消")
        try:
            target = build_target(target_id, timeout_s=timeout_s)  # 校验失败在此抛出
            items = load_eval_set(DATA_FILE)
            if not items:
                raise ValueError("评测集为空，请先在「数据集」页生成或补充用例")
        except Exception:
            self._single.release()
            raise
        run_id = new_run_id()
        live = LiveState(total=len(items))
        self._live[run_id] = live
        meta = get_target_meta(target_id) or {}
        threading.Thread(
            target=self._worker, daemon=True,
            args=(run_id, target, target_id, meta.get("label", target_id), items, note, live),
        ).start()
        return run_id

    def status(self, run_id: str) -> Optional[dict]:
        """轻量进度（<1KB）。运行中读内存，终态读文件。"""
        live = self._live.get(run_id)
        if live is not None:
            return {
                "run_id": run_id, "status": "running",
                "progress": {"done": live.done, "total": live.total},
                "current_question": live.current_question,
                "elapsed_ms": round((time.perf_counter() - live.started_at) * 1000),
                "error": None,
            }
        doc = self._store.load(run_id)
        if doc is None:
            return None
        return {
            "run_id": run_id, "status": doc.get("status"),
            "progress": doc.get("progress") or {"done": 0, "total": 0},
            "current_question": None,
            "elapsed_ms": doc.get("duration_ms"),
            "error": doc.get("error"),
        }

    def cancel(self, run_id: str) -> bool:
        """协作式取消：只置事件，工作线程在每条用例开始前检查。"""
        live = self._live.get(run_id)
        if live is None:
            return False
        live.cancel.set()
        return True

    def _worker(self, run_id, target, target_id, label, items, note, live) -> None:
        started = datetime.now().astimezone()
        results: list[dict] = []
        status, error = "completed", None
        try:
            for i, item in enumerate(items):
                if live.cancel.is_set():
                    status = "cancelled"
                    break
                live.current_question = item.get("question")
                results.append(evaluate_item_detail(target, item, index=i))
                live.done = i + 1
        except Exception as e:  # 防御：单条异常已在 evaluate_item_detail 内消化
            status, error = "failed", f"{type(e).__name__}: {e}"
        finished = datetime.now().astimezone()
        self._store.save({
            "schema_version": SCHEMA_VERSION,
            "run_id": run_id,
            "status": status,
            "target": {"id": target_id, "label": label,
                       "model": getattr(target, "model", None)},
            "dataset": {"path": "data/eval.jsonl", "size": len(items),
                        "sha1": sha1_of_file(DATA_FILE)},
            "note": note,
            "created_at": started.isoformat(),
            "finished_at": finished.isoformat(),
            "duration_ms": round((finished - started).total_seconds() * 1000),
            "partial": status in ("cancelled", "interrupted"),
            "error": error,
            "progress": {"done": len(results), "total": len(items)},
            "summary": summarize_run(results),
            "items": results,
        })
        self._live.pop(run_id, None)
        self._single.release()
