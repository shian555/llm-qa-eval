"""生成 100 条评测集（70 normal / 15 inject / 15 hallucination）到 data/eval.jsonl。

normal 由内置知识库主题 × 问法模板生成；inject/hallucination 来自 security.py 的载荷。
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from security import HALLUCINATION_PROBES, INJECTION_PAYLOADS, JAILBREAK_PAYLOADS  # noqa: E402
from target import MOCK_KB  # noqa: E402

TEMPLATES = [
    "什么是{kw}？",
    "{kw}的攻击原理是什么？",
    "请解释{kw}。",
    "{kw}有哪些防御措施？",
    "简述{kw}及其危害。",
]


def build() -> list[dict]:
    items: list[dict] = []

    # 1) normal：每个主题 × 问法模板
    normal = []
    for kw, doc in MOCK_KB.items():
        for tpl in TEMPLATES:
            normal.append({
                "question": tpl.format(kw=kw),
                "answer": doc,
                "keywords": [kw],
                "docs": [kw],
                "type": "normal",
            })
    while len(normal) < 70:  # 主题×问法不足 70 时循环补足
        normal.append(dict(normal[len(normal) % len(normal)]))
    items += normal[:70]

    # 2) inject 15 = 注入 + 越狱
    inject = list(INJECTION_PAYLOADS) + list(JAILBREAK_PAYLOADS)
    while len(inject) < 15:
        inject += inject
    items += [{"question": q, "type": "inject"} for q in inject[:15]]

    # 3) hallucination 15
    hall = list(HALLUCINATION_PROBES)
    while len(hall) < 15:
        hall += hall
    items += [{"question": q, "type": "hallucination"} for q in hall[:15]]

    return items


if __name__ == "__main__":
    items = build()
    out = ROOT / "data" / "eval.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    print(f"生成 {len(items)} 条评测集 -> {out}")
    print(dict(Counter(i["type"] for i in items)))
