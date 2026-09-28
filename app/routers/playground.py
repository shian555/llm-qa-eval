"""Playground：任意问题 -> 检索片段 + 答案 + 可评的指标与安全标记。

recall/accuracy 以评测集 normal 用例为基准（gold_found 标记是否命中基准）；
citation_accuracy 与安全启发式对任意答案恒可计算，保证任何输入都有反馈。
"""
from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException

from metrics import answer_accuracy, citation_accuracy, recall_at_k
from run_eval import load_eval_set
from security import (HALLUCINATION_PROBES, INJECTION_PAYLOADS, JAILBREAK_PAYLOADS,
                      is_defended, is_hallucinated)
from target import MOCK_KB

from ..config import DATA_FILE
from ..registry import build_target
from ..schemas import PlaygroundReq

router = APIRouter(prefix="/api", tags=["playground"])


@router.get("/kb")
def kb():
    """内置知识库主题 + 攻击载荷样例（前端快捷标签）。"""
    return {
        "topics": [{"keyword": k, "question": f"什么是{k}？"} for k in MOCK_KB],
        "attacks": {
            "injection": INJECTION_PAYLOADS[:2],
            "jailbreak": JAILBREAK_PAYLOADS[:2],
            "hallucination": HALLUCINATION_PROBES[:2],
        },
    }


@router.post("/playground")
def playground(req: PlaygroundReq):
    try:
        target = build_target(req.target_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=400, detail=f"未知被测对象：{req.target_id}")

    t0 = time.perf_counter()
    hits = target.retrieve(req.question, k=req.k)
    try:
        answer = target.generate(req.question, hits)
    except Exception as e:
        return {
            "target_id": req.target_id, "question": req.question,
            "contexts": hits, "answer": None,
            "latency_ms": round((time.perf_counter() - t0) * 1000),
            "metrics": None, "security": None,
            "error": f"{type(e).__name__}: {e}",
        }
    latency = round((time.perf_counter() - t0) * 1000)

    gold = None
    if DATA_FILE.is_file():
        qn = req.question.strip()
        for it in load_eval_set(DATA_FILE):
            if it.get("type") == "normal" and (it.get("question") or "").strip() == qn:
                gold = it
                break

    if gold is not None:
        metrics = {
            "gold_found": True, "note": None,
            "recall": round(recall_at_k(hits, gold.get("docs", [])), 3),
            "accuracy": round(answer_accuracy(answer, gold.get("answer", ""),
                                              gold.get("keywords")), 3),
            "citation": round(citation_accuracy(answer, hits), 3),
        }
    else:
        metrics = {
            "gold_found": False,
            "note": "该问题不在评测集 normal 用例中：召回/准确率以数据集为基准无法计算，仅引用准确性可评",
            "recall": None, "accuracy": None,
            "citation": round(citation_accuracy(answer, hits), 3),
        }
    return {
        "target_id": req.target_id, "question": req.question,
        "contexts": hits, "answer": answer, "latency_ms": latency,
        "metrics": metrics,
        "security": {"defended": is_defended(answer), "hallucinated": is_hallucinated(answer)},
        "error": None,
    }
