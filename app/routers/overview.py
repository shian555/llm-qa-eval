"""总览 Dashboard 聚合接口 + 被测对象列表。"""
from __future__ import annotations

from fastapi import APIRouter

from run_eval import load_eval_set

from ..config import DATA_FILE
from ..instance import instance
from ..registry import list_targets
from ..services.compare import RADAR_INDICATORS
from ..services.evaluate import TYPE_LABELS

router = APIRouter(prefix="/api", tags=["overview"])


@router.get("/overview")
def overview():
    """KPI 以最近一次 completed 运行为当前快照；trend 覆盖全部 completed 运行。"""
    metas = instance.store.list_meta()
    completed = [m for m in metas if m.get("status") == "completed"]
    latest = completed[0] if completed else None

    dataset = load_eval_set(DATA_FILE) if DATA_FILE.is_file() else []
    dist: dict[str, int] = {"normal": 0, "inject": 0, "hallucination": 0}
    for it in dataset:
        dist[it["type"]] = dist.get(it["type"], 0) + 1

    summary = (latest or {}).get("summary") or {}
    by_type = summary.get("by_type") or {}
    normal = by_type.get("normal") or {}
    security = summary.get("security") or {}
    dims = summary.get("dims") or {}

    kpis = {
        "dataset_size": len(dataset),
        "type_distribution": dist,
        "latest_run": latest,
        "overall_pass_rate": (summary.get("overall") or {}).get("pass_rate"),
        "avg_recall": normal.get("avg_recall"),
        "avg_accuracy": normal.get("avg_accuracy"),
        "avg_citation": normal.get("avg_citation"),
        "attack_total": security.get("attack_total"),
        "attack_blocked": (security.get("attack_total") or 0) - (security.get("breached") or 0),
        "security_block_rate": security.get("block_rate"),
    }
    radar = {
        "indicators": RADAR_INDICATORS,
        "value": [dims.get("recall") or 0, dims.get("accuracy") or 0, dims.get("citation") or 0],
    }
    trend = [{
        "run_id": m["run_id"],
        "created_at": m.get("created_at"),
        "label": (m.get("target") or {}).get("label"),
        "overall_pass_rate": ((m.get("summary") or {}).get("overall") or {}).get("pass_rate"),
        "security_block_rate": ((m.get("summary") or {}).get("security") or {}).get("block_rate"),
        "recall": (((m.get("summary") or {}).get("by_type") or {}).get("normal") or {}).get("avg_recall"),
    } for m in reversed(completed)]
    type_pass = [{"type": t, "label": label,
                  "pass_rate": (by_type.get(t) or {}).get("pass_rate")}
                 for t, label in TYPE_LABELS.items()]
    return {
        "kpis": kpis,
        "radar": radar,
        "trend": trend,
        "type_pass": type_pass,
        "recent_runs": metas[:10],
    }


@router.get("/targets")
def targets():
    """被测对象列表 + 可用性（只探测 env 存在性，不回显 key）。"""
    return {"targets": list_targets()}
