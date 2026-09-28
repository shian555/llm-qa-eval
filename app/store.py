"""运行历史存储：JSON 文件 + 原子写 + legacy 迁移 + 中断恢复。

选 JSON 文件而非 SQLite：与现有 report.json 同构、零迁移、数据量小（每次运行
一个文件）、人工可直接打开检查，git 可提交示例 run 让 clone 即可演示。
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path

from .config import REPORT_JSON, RUNS_DIR
from .services.evaluate import legacy_items_to_v2, summarize_run


def strip_items(doc: dict) -> dict:
    """去掉 items 的运行 meta（列表/选择器场景，避免传输全部明细）。"""
    return {k: v for k, v in doc.items() if k != "items"}


class RunStore:
    def __init__(self, runs_dir: Path | None = None, legacy_report: Path | None = None):
        self._dir = Path(runs_dir) if runs_dir else RUNS_DIR
        self._legacy_report = Path(legacy_report) if legacy_report else REPORT_JSON
        self._lock = threading.RLock()
        self._dir.mkdir(parents=True, exist_ok=True)
        self._migrate_legacy()
        self._mark_interrupted()

    # ---------- 读 ----------
    def load(self, run_id: str) -> dict | None:
        with self._lock:
            path = self._path(run_id)
            if not path.is_file():
                return None
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return None

    def list_all(self) -> list[dict]:
        """全部运行文档，created_at 降序。"""
        docs = []
        with self._lock:
            for path in self._dir.glob("*.json"):
                try:
                    docs.append(json.loads(path.read_text(encoding="utf-8")))
                except (json.JSONDecodeError, OSError):
                    continue
        docs.sort(key=lambda d: d.get("created_at") or "", reverse=True)
        return docs

    def list_meta(self) -> list[dict]:
        return [strip_items(d) for d in self.list_all()]

    # ---------- 写 ----------
    def save(self, doc: dict) -> None:
        with self._lock:
            path = self._path(doc["run_id"])
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, path)  # 同目录原子替换，Windows 下安全

    def delete(self, run_id: str) -> bool:
        with self._lock:
            path = self._path(run_id)
            if path.is_file():
                path.unlink()
                return True
            return False

    # ---------- 内部 ----------
    def _path(self, run_id: str) -> Path:
        return self._dir / f"{run_id}.json"

    def _migrate_legacy(self) -> None:
        """首次启动：把 CLI 的 results/report.json 迁移为首条运行记录（原文件不动）。"""
        with self._lock:
            if any(self._dir.glob("*.json")) or not self._legacy_report.is_file():
                return
            try:
                legacy = json.loads(self._legacy_report.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return
            v2_items = legacy_items_to_v2(legacy.get("items") or [])
            created = datetime.fromtimestamp(
                self._legacy_report.stat().st_mtime).astimezone().isoformat()
            self.save({
                "schema_version": 2,
                "run_id": "r-legacy-mock-0001",
                "status": "completed",
                "target": {"id": "mock", "label": "MockQATarget（离线基线）", "model": None},
                "dataset": {"path": "data/eval.jsonl", "size": len(v2_items), "sha1": None},
                "note": "由 CLI run_eval.py 的历史报告自动迁移",
                "created_at": created,
                "finished_at": created,
                "duration_ms": None,
                "partial": False,
                "error": None,
                "progress": {"done": len(v2_items), "total": len(v2_items)},
                "summary": summarize_run(v2_items),
                "items": v2_items,
            })

    def _mark_interrupted(self) -> None:
        """服务重启后，把残留的 running/pending 运行标记为 interrupted（已完成明细保留）。"""
        with self._lock:
            for doc in self.list_all():
                if doc.get("status") in ("running", "pending"):
                    done = len(doc.get("items") or [])
                    total = (doc.get("progress") or {}).get("total") or done
                    doc["status"] = "interrupted"
                    doc["partial"] = True
                    doc["error"] = "服务重启导致运行中断，已完成部分已保留"
                    doc["progress"] = {"done": done, "total": total}
                    self.save(doc)
