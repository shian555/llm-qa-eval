"""两次运行的结构化对比（Promptfoo 式 side-by-side）：指标 delta + 用例级退化/改善。"""
from __future__ import annotations

from collections import defaultdict

from .evaluate import TYPE_LABELS

RADAR_INDICATORS = [
    {"name": "检索召回 Recall@8", "max": 1},
    {"name": "问答准确率", "max": 1},
    {"name": "引用准确性", "max": 1},
]


def _pack(a, b) -> dict:
    delta = None if (a is None or b is None) else round(b - a, 3)
    return {"a": a, "b": b, "delta": delta}


def _dim_list(dims: dict) -> list:
    dims = dims or {}
    return [dims.get("recall") or 0, dims.get("accuracy") or 0, dims.get("citation") or 0]


def _pair_items(a_items: list[dict], b_items: list[dict]):
    """配对两次运行的用例：同数据集按 index；否则按 (type, question) 多重匹配。"""
    if len(a_items) == len(b_items) and all(
        x.get("type") == y.get("type") for x, y in zip(a_items, b_items)
    ):
        return list(zip(a_items, b_items))
    buckets: defaultdict = defaultdict(list)
    for it in a_items:
        buckets[(it.get("type"), it.get("question"))].append(it)
    pairs = []
    for it in b_items:
        lst = buckets.get((it.get("type"), it.get("question")))
        if lst:
            pairs.append((lst.pop(0), it))
    return pairs


def _run_head(doc: dict) -> dict:
    return {
        "run_id": doc.get("run_id"),
        "label": (doc.get("target") or {}).get("label"),
        "created_at": doc.get("created_at"),
        "summary": doc.get("summary"),
    }


def diff_runs(a: dict, b: dict) -> dict:
    sa, sb = a.get("summary") or {}, b.get("summary") or {}
    na, nb = (sa.get("by_type") or {}).get("normal") or {}, (sb.get("by_type") or {}).get("normal") or {}

    overall = {
        "pass_rate": _pack((sa.get("overall") or {}).get("pass_rate"),
                           (sb.get("overall") or {}).get("pass_rate")),
        "avg_recall": _pack(na.get("avg_recall"), nb.get("avg_recall")),
        "avg_accuracy": _pack(na.get("avg_accuracy"), nb.get("avg_accuracy")),
        "avg_citation": _pack(na.get("avg_citation"), nb.get("avg_citation")),
        "security_block_rate": _pack((sa.get("security") or {}).get("block_rate"),
                                     (sb.get("security") or {}).get("block_rate")),
    }

    by_type = []
    for t, label in TYPE_LABELS.items():
        ta = (sa.get("by_type") or {}).get(t) or {}
        tb = (sb.get("by_type") or {}).get(t) or {}
        entry: dict = {
            "type": t, "label": label,
            "total": {"a": ta.get("total"), "b": tb.get("total")},
            "pass_rate": _pack(ta.get("pass_rate"), tb.get("pass_rate")),
        }
        if t == "normal":
            entry.update(avg_recall=_pack(ta.get("avg_recall"), tb.get("avg_recall")),
                         avg_accuracy=_pack(ta.get("avg_accuracy"), tb.get("avg_accuracy")),
                         avg_citation=_pack(ta.get("avg_citation"), tb.get("avg_citation")))
        elif t == "inject":
            entry.update(asr=_pack(ta.get("asr"), tb.get("asr")))
        else:
            entry.update(hallucination_rate=_pack(ta.get("hallucination_rate"),
                                                  tb.get("hallucination_rate")))
        by_type.append(entry)

    regressions, improvements = [], []
    both_pass = both_fail = 0
    for it_a, it_b in _pair_items(a.get("items") or [], b.get("items") or []):
        pa, pb = bool(it_a.get("passed")), bool(it_b.get("passed"))
        detail = {
            "index": it_b.get("index"), "type": it_b.get("type"),
            "question": it_b.get("question"),
            "a": {"passed": pa, "scores": it_a.get("scores"),
                  "defended": it_a.get("defended"), "hallucinated": it_a.get("hallucinated")},
            "b": {"passed": pb, "scores": it_b.get("scores"),
                  "defended": it_b.get("defended"), "hallucinated": it_b.get("hallucinated")},
        }
        if pa and not pb:
            regressions.append(detail)
        elif pb and not pa:
            improvements.append(detail)
        elif pa:
            both_pass += 1
        else:
            both_fail += 1

    return {
        "a": _run_head(a),
        "b": _run_head(b),
        "overall": overall,
        "by_type": by_type,
        "radar": {"indicators": RADAR_INDICATORS,
                  "a": _dim_list(sa.get("dims")), "b": _dim_list(sb.get("dims"))},
        "item_diff": {
            "regressions": len(regressions), "improvements": len(improvements),
            "unchanged_pass": both_pass, "unchanged_fail": both_fail,
            "details": regressions + improvements,
        },
    }
