"""评测执行与结果聚合：复用根目录 run_eval 的既有逻辑，只做平台化扩展。"""
from __future__ import annotations

import time
from typing import Optional

from run_eval import evaluate_item

TYPE_LABELS = {"normal": "功能问答", "inject": "注入/越狱", "hallucination": "幻觉探针"}


def evaluate_item_detail(target, item: dict, index: int) -> dict:
    """跑单条用例并补齐平台扩展字段（contexts / latency / error / scores 归并）。

    单条异常不炸整场：记为 error 明细，passed=False，继续下一条。
    """
    t0 = time.perf_counter()
    try:
        raw = evaluate_item(target, item, capture_contexts=True)
        error = None
    except Exception as e:
        raw, error = {}, f"{type(e).__name__}: {e}"
    scores = None
    if "recall" in raw:
        scores = {"recall": raw["recall"], "accuracy": raw["accuracy"],
                  "citation": raw["citation"]}
    return {
        "index": index,
        "type": raw.get("type", item.get("type")),
        "question": item.get("question"),
        "contexts": raw.get("contexts"),
        "answer": raw.get("answer"),
        "scores": scores,
        "defended": raw.get("defended"),
        "hallucinated": raw.get("hallucinated"),
        "passed": bool(raw.get("passed")),
        "error": error,
        "latency_ms": round((time.perf_counter() - t0) * 1000),
    }


def _avg(vals: list) -> Optional[float]:
    return round(sum(vals) / len(vals), 3) if vals else None


def summarize_run(items: list[dict]) -> dict:
    """把明细聚合成归一化 summary（区别于 CLI report.json 的 vals 数组格式）。"""
    g = {t: {"total": 0, "passed": 0, "recall": [], "accuracy": [], "citation": []}
         for t in TYPE_LABELS}
    for it in items:
        b = g.setdefault(it.get("type"),
                         {"total": 0, "passed": 0, "recall": [], "accuracy": [], "citation": []})
        b["total"] += 1
        b["passed"] += int(bool(it.get("passed")))
        s = it.get("scores") or {}
        for k in ("recall", "accuracy", "citation"):
            if s.get(k) is not None:
                b[k].append(s[k])

    by_type: dict[str, dict] = {}
    for t, b in g.items():
        entry: dict = {"total": b["total"], "passed": b["passed"],
                       "pass_rate": round(b["passed"] / b["total"], 3) if b["total"] else None}
        if t == "normal":
            entry.update(avg_recall=_avg(b["recall"]), avg_accuracy=_avg(b["accuracy"]),
                         avg_citation=_avg(b["citation"]))
        elif t == "inject":
            breached = b["total"] - b["passed"]
            entry.update(attack_total=b["total"], breached=breached,
                         asr=round(breached / b["total"], 3) if b["total"] else None)
        else:
            hallucinated = b["total"] - b["passed"]
            entry.update(hallucinated=hallucinated,
                         hallucination_rate=round(hallucinated / b["total"], 3) if b["total"] else None)
        by_type[t] = entry

    normal = by_type.get("normal", {})
    inject, halluc = by_type.get("inject", {}), by_type.get("hallucination", {})
    attack_total = inject.get("total", 0) + halluc.get("total", 0)
    breached = inject.get("breached", 0) + halluc.get("hallucinated", 0)
    total = sum(b["total"] for b in g.values())
    passed = sum(b["passed"] for b in g.values())
    return {
        "overall": {"total": total, "passed": passed,
                    "pass_rate": round(passed / total, 3) if total else None},
        "by_type": by_type,
        "dims": {"recall": normal.get("avg_recall"), "accuracy": normal.get("avg_accuracy"),
                 "citation": normal.get("avg_citation")},
        "security": {"attack_total": attack_total, "breached": breached,
                     "block_rate": round(1 - breached / attack_total, 3) if attack_total else None,
                     "asr": round(breached / attack_total, 3) if attack_total else None},
    }


def legacy_items_to_v2(items: list[dict]) -> list[dict]:
    """把 CLI report.json 的扁平 items 迁移为平台 v2 结构（contexts 无法回填 -> None）。"""
    out = []
    for i, it in enumerate(items):
        scores = None
        if "recall" in it:
            scores = {"recall": it.get("recall"), "accuracy": it.get("accuracy"),
                      "citation": it.get("citation")}
        out.append({
            "index": i, "type": it.get("type"), "question": it.get("question"),
            "contexts": None, "answer": it.get("answer"), "scores": scores,
            "defended": it.get("defended"), "hallucinated": it.get("hallucinated"),
            "passed": it.get("passed"), "error": None, "latency_ms": None,
        })
    return out
