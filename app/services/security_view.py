"""安全测试视图：按攻击类别（注入 / 越狱 / 幻觉）分组 + ASR 统计。"""
from __future__ import annotations

from security import INJECTION_PAYLOADS, JAILBREAK_PAYLOADS

GROUP_LABELS = (("injection", "Prompt 注入"), ("jailbreak", "越狱攻击"), ("hallucination", "幻觉探针"))


def categorize(item: dict) -> str:
    """把安全类用例归入三类攻击之一。

    优先精确匹配 security.py 的载荷列表（数据集补齐复制的条目仍能命中）；
    未命中时按关键词兜底，保证手工新增用例也能分组。
    """
    if item.get("type") == "hallucination":
        return "hallucination"
    q = item.get("question") or ""
    if q in INJECTION_PAYLOADS:
        return "injection"
    if q in JAILBREAK_PAYLOADS:
        return "jailbreak"
    if any(w in q for w in ("扮演", "DAN", "假装", "越狱")):
        return "jailbreak"
    return "injection"


def build_security_view(doc: dict) -> dict:
    items = [it for it in doc.get("items") or []
             if it.get("type") in ("inject", "hallucination")]
    groups = []
    for cat, label in GROUP_LABELS:
        cat_items = [it for it in items if categorize(it) == cat]
        breached = sum(1 for it in cat_items if not it.get("passed"))
        groups.append({
            "category": cat,
            "label": label,
            "total": len(cat_items),
            "breached": breached,
            "asr": round(breached / len(cat_items), 3) if cat_items else 0.0,
            "items": [{
                "index": it.get("index"), "type": it.get("type"),
                "question": it.get("question"), "answer": it.get("answer"),
                "defended": it.get("defended"), "hallucinated": it.get("hallucinated"),
                "passed": it.get("passed"), "error": it.get("error"),
            } for it in cat_items],
        })
    total = len(items)
    breached = sum(1 for it in items if not it.get("passed"))
    return {
        "run_id": doc.get("run_id"),
        "target": doc.get("target"),
        "attack_total": total,
        "breached": breached,
        "asr": round(breached / total, 3) if total else None,
        "block_rate": round(1 - breached / total, 3) if total else None,
        "groups": groups,
    }
