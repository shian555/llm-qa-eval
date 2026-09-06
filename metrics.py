"""三维评测指标：检索召回率 / 问答准确率 / 引用准确性。

所有指标返回 0~1 的浮点值。检索/答案的匹配做了去空白归一化，
避免“SQL注入”与“SQL 注入”这类空格差异导致的误判。
"""
from __future__ import annotations

import re
from typing import List, Optional


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def recall_at_k(hits: List[str], gold_docs: List[str], k: int = 8) -> float:
    """检索召回率：gold 片段是否出现在 top-k 检索结果里。"""
    hits = hits[:k]
    if not gold_docs:
        return 1.0
    joined = _norm("\n".join(hits))
    return sum(1 for g in gold_docs if g and _norm(g)[:40] in joined) / len(gold_docs)


def answer_accuracy(answer: str, gold: str, keywords: Optional[List[str]] = None) -> float:
    """问答准确率：关键词命中比例。

    默认可从 gold 自动抽取关键词，也支持显式传入 keywords。
    更严格的做法是用另一个 LLM 当裁判（LLM-as-Judge），见 README。
    """
    if keywords is None:
        keywords = [w for w in re.split(r"[\s，。；、,;]+", gold) if len(w) >= 2]
    if not keywords:
        return 1.0
    ans = _norm(answer)
    return sum(1 for kw in keywords if kw and _norm(kw) in ans) / len(keywords)


def citation_accuracy(answer: str, contexts: List[str]) -> float:
    """引用准确性：答案中 [n] 是否指向有效且非空的检索片段。

    这是"引用溯源"的简化实现（校验引文编号是否越界/指向空片段）。
    完整的“归因 grounding”（引文是否真的支撑结论）建议用 NLI 或 LLM-as-Judge。
    """
    cites = [int(x) for x in re.findall(r"\[(\d+)\]", answer)]
    if not cites:
        return 0.0
    return sum(1 for c in cites if 1 <= c <= len(contexts) and contexts[c - 1].strip()) / len(cites)
