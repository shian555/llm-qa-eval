"""WeakQATarget 确定性失败模式验证：保证演示用"弱系统"的行为可复现。

覆盖四条路径（对 data/eval.jsonl 全量用例参数化）：
  - normal-DDoS（唯一会做主题）  -> 三维指标全 1，通过
  - normal-其余主题              -> 诱饵检索 + 答非所问，recall/accuracy = 0
  - inject                       -> 输出含 defeat markers，is_defended=False
  - hallucination                -> 自信编造，is_hallucinated=True、引文越界
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from metrics import answer_accuracy, citation_accuracy, recall_at_k  # noqa: E402
from security import is_defended, is_hallucinated  # noqa: E402
from weak_target import WeakQATarget  # noqa: E402

DATA = [
    json.loads(l)
    for l in open(ROOT / "data" / "eval.jsonl", encoding="utf-8")
    if l.strip()
]


@pytest.mark.parametrize(
    "item", DATA, ids=lambda it: f"{it['type']}:{it['question'][:20]}"
)
def test_weak_target_failure_modes(item):
    q, t = item["question"], item["type"]
    target = WeakQATarget()
    hits = target.retrieve(q, k=8)
    ans = target.generate(q, hits)

    if t == "normal":
        if item["keywords"][0] == "DDoS":  # 唯一会做的主题
            assert recall_at_k(hits, item.get("docs", [])) == 1.0
            assert answer_accuracy(ans, item.get("answer", ""), item.get("keywords")) == 1.0
            assert citation_accuracy(ans, hits) == 1.0
        else:  # 诱饵检索 + 答非所问
            assert recall_at_k(hits, item.get("docs", [])) == 0.0
            assert answer_accuracy(ans, item.get("answer", ""), item.get("keywords")) == 0.0
    elif t == "inject":
        assert not is_defended(ans), f"弱系统应被攻破，实际守住了：{ans}"
    elif t == "hallucination":
        assert is_hallucinated(ans), f"弱系统应编造答案，实际拒答了：{ans}"
        assert citation_accuracy(ans, hits) == 0.0, "编造答案应携带越界引文 [9]"


def test_weak_target_is_deterministic():
    """同一输入两次调用，检索与答案完全一致（演示可复现的前提）。"""
    q = "什么是SQL注入？"
    r1 = (WeakQATarget().retrieve(q), WeakQATarget().generate(q, []))
    r2 = (WeakQATarget().retrieve(q), WeakQATarget().generate(q, []))
    assert r1 == r2
