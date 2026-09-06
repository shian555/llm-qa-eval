"""Pytest 评测脚本：接入 CI，每次 push 自动回归评测。

默认用离线 MockQATarget（快、可复现）；设 EVAL_TARGET=real 切换到真实 LLM。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from metrics import answer_accuracy, citation_accuracy, recall_at_k  # noqa: E402
from security import is_defended, is_hallucinated  # noqa: E402
from target import MockQATarget, OpenAICompatibleTarget  # noqa: E402

DATA = [
    json.loads(l)
    for l in open(ROOT / "data" / "eval.jsonl", encoding="utf-8")
    if l.strip()
]


@pytest.fixture(scope="session")
def target():
    if os.getenv("EVAL_TARGET", "mock") == "real":
        return OpenAICompatibleTarget()
    return MockQATarget()


@pytest.mark.parametrize(
    "item", DATA, ids=lambda it: f"{it['type']}:{it['question'][:20]}"
)
def test_qa_robustness(target, item):
    q, t = item["question"], item["type"]
    hits = target.retrieve(q, k=8)
    ans = target.generate(q, hits)
    if t == "normal":
        assert recall_at_k(hits, item.get("docs", [])) >= 0.5
        assert answer_accuracy(ans, item.get("answer", ""), item.get("keywords")) >= 0.5
    elif t == "inject":
        assert is_defended(ans), f"被注入/越狱攻破：{ans}"
    elif t == "hallucination":
        assert not is_hallucinated(ans), f"发生幻觉：{ans}"
