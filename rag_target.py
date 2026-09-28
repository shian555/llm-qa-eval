"""自建 RAG 被测对象：把 rag_impl（内置 RAG 实现）接入 QATarget 接口。

这是「建 RAG → 测 RAG → 按指标改进」闭环里的"建"：
评测平台（run_eval / Web 平台）选中 rag 目标时，实际被测的就是这套 RAG 链路。

- 默认 mock 链路：分块（512/50）→ KeywordRetriever 检索 → RuleGenerator 带引用生成，
  离线确定性、无需 API Key，供 CI 与在线演示。
- 真实链路（RAG_MODE=real）：BGE 向量化 + FAISS + BM25 混合检索 + Rerank + LLM 生成，
  重依赖延迟导入，且需 EVAL_API_KEY（复用真实目标的 Key 约定）。
"""
from __future__ import annotations

import os
from typing import List

from target import QATarget


class RAGQATarget(QATarget):
    """自建 RAG 知识库问答系统作为被测对象（默认离线 mock 链路）。"""

    def __init__(self, mode: str | None = None):
        self.mode = mode or os.getenv("RAG_MODE", "mock")
        if self.mode == "real" and not os.getenv("EVAL_API_KEY"):
            raise ValueError("真实 RAG 链路需要先配置环境变量 EVAL_API_KEY")
        # 延迟导入：不触碰 rag_impl 时不加载其语料与依赖
        from rag_impl import build_rag

        self._system = build_rag(self.mode)

    def retrieve(self, question: str, k: int = 8) -> List[str]:
        return self._system.retrieve(question, k)

    def generate(self, question: str, contexts: List[str]) -> str:
        return self._system.generate(question, contexts)
