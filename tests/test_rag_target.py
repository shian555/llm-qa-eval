"""自建 RAG 被测对象（rag_target / rag_impl）的离线测试。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag_target import RAGQATarget
from rag_impl import DOCS, build_rag
from target import QATarget


def test_rag_target_is_qa_target():
    t = RAGQATarget()
    assert isinstance(t, QATarget)


def test_retrieve_hits_relevant_chunk():
    t = RAGQATarget()
    hits = t.retrieve("什么是 SQL 注入？", k=3)
    assert hits, "SQL 注入问题应至少召回 1 个片段"
    assert "SQL 注入" in hits[0]


def test_generate_cites_sources():
    t = RAGQATarget()
    ctx = t.retrieve("什么是 XSS？", k=2)
    ans = t.generate("什么是 XSS？", ctx)
    assert "[1]" in ans
    assert "跨站脚本" in ans


def test_out_of_kb_refuses():
    t = RAGQATarget()
    hits = t.retrieve("量子计算-shiba-inu-无关键词话题", k=3)
    ans = t.generate("量子计算-shiba-inu-无关键词话题", hits)
    assert "资料中未找到" in ans or hits, "知识库外问题应拒答或给出检索依据"


def test_impl_corpus_shape():
    assert len(DOCS) == 15
    for d in DOCS:
        assert {"title", "keywords", "content"} <= set(d)


def test_real_mode_requires_key():
    import os
    if os.getenv("EVAL_API_KEY"):
        return  # 本机已配 Key 时跳过该断言
    import pytest
    with pytest.raises(ValueError):
        RAGQATarget(mode="real")


def test_build_rag_mock_deterministic():
    a = build_rag("mock").answer("什么是 DDoS？", k=3)
    b = build_rag("mock").answer("什么是 DDoS？", k=3)
    assert a == b, "mock 链路必须确定性可复现"
