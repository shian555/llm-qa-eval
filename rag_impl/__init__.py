"""自建 RAG 问答系统（被测对象）。

源码 vendored 自 github.com/shian555/rag-qa-system（本项目的被测系统），
以包形式集成进评测平台，便于单服务部署与「建 RAG → 测 RAG」闭环演示。
独立版本与语料扩展指南见原仓库。
"""
from .corpus import DOCS
from .rag import RAGSystem, build_rag, chunk_text

__all__ = ["DOCS", "RAGSystem", "build_rag", "chunk_text"]
