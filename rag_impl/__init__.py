"""内置 RAG 问答系统（被测对象）。

本平台的内置 RAG 实现：分块（512/50）→ 检索（mock 关键词 / BGE+FAISS+BM25 混合）
→ 带引用生成。作为「建 RAG → 测 RAG」闭环里的"建"，是评测系统的真实被测对象。
"""
from .corpus import DOCS
from .rag import RAGSystem, build_rag, chunk_text

__all__ = ["DOCS", "RAGSystem", "build_rag", "chunk_text"]
