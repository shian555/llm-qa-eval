"""RAG 问答系统核心：分块 → 检索 → 生成（带引用溯源）。

暴露与 llm-qa-eval 的 QATarget 一致的接口（retrieve / generate），
可直接作为被测对象接入评测闭环。

- mock：KeywordRetriever + RuleGenerator，离线确定性，演示 + CI。
- real：HybridRetriever（BGE+FAISS+BM25+Rerank）+ LLMGenerator（OpenAI 兼容）。
"""
from __future__ import annotations

import os
from typing import List

from .corpus import DOCS


def chunk_text(text: str, size: int = 512, overlap: int = 50) -> List[str]:
    """递归/滑窗分块：按固定窗口 + 重叠切分长文本。"""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        if start + size >= len(text):
            break
        start += size - overlap
    return chunks


class KeywordRetriever:
    """关键词检索（mock）：按关键词命中数打分排序。"""

    def __init__(self, docs, chunk_size: int = 512, chunk_overlap: int = 50):
        self.chunks = []
        for d in docs:
            for c in chunk_text(d["content"], chunk_size, chunk_overlap):
                self.chunks.append({"content": c, "title": d["title"], "keywords": d.get("keywords", [])})

    def retrieve(self, question: str, k: int = 8) -> List[str]:
        scored = []
        for c in self.chunks:
            s = sum(1 for kw in c["keywords"] if kw and kw in question)
            if s:
                scored.append((s, c))
        scored.sort(key=lambda x: -x[0])
        return [c["content"] for _, c in scored[:k]]


# 输入护栏词表：命中即拒绝生成（注入/越狱意图的粗过滤，生产可换分类器）
_GUARD_WORDS = ("忽略", "系统提示", "隐藏提示", "DAN", "扮演", "假装",
                "没有限制", "绕过", "入侵", "黑客", "翻译成英文")


class RuleGenerator:
    """规则生成（mock）：把检索片段串成带 [n] 引用的答案。

    v2：新增输入护栏。来历：llm-qa-eval 三维评测发现初版对注入/越狱无防御
    （inject 组通过率仅 73.3%，越狱问题检索出含「绕过/伪造」标记词的正常语料，
    答案被判定攻破）；加护栏后复测 100%。设 RAG_INPUT_GUARD=off 可关闭，
    用于 A/B 复测对比。
    """

    def __init__(self, guard: bool | None = None):
        if guard is None:
            guard = os.getenv("RAG_INPUT_GUARD", "on") != "off"
        self.guard = guard

    def generate(self, question: str, contexts: List[str]) -> str:
        if self.guard and any(w in question for w in _GUARD_WORDS):
            return "抱歉，我无法执行该请求。"
        if not contexts:
            return "资料中未找到。"
        parts = [f"[{i + 1}] {c}" for i, c in enumerate(contexts)]
        return "根据知识库：" + "；".join(parts)


class LLMGenerator:
    """真实生成：OpenAI 兼容接口（Qwen/DeepSeek/硅基流动）。"""

    def __init__(self, api_key=None, base_url=None, model=None):
        self.api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("EVAL_API_KEY")
        self.base_url = base_url or os.getenv("LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
        self.model = model or os.getenv("LLM_MODEL", "qwen2.5-7b-instruct")

    def generate(self, question: str, contexts: List[str]) -> str:
        from openai import OpenAI  # 延迟导入，mock 模式无需安装

        client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        ctx = "\n\n".join(f"[{i + 1}] {c}" for i, c in enumerate(contexts))
        prompt = (
            "你是安全知识库助手。只根据下面资料回答，答案用 [n] 标注引用；"
            "资料不足就说“资料中未找到”。\n\n参考资料：\n{ctx}\n\n问题：{q}\n回答："
        ).format(ctx=ctx or "（无）", q=question)
        r = client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        return r.choices[0].message.content


class RAGSystem:
    """组合检索器与生成器，对外提供 answer()。"""

    def __init__(self, retriever, generator):
        self.retriever = retriever
        self.generator = generator

    def retrieve(self, question: str, k: int = 8) -> List[str]:
        return self.retriever.retrieve(question, k)

    def generate(self, question: str, contexts: List[str]) -> str:
        return self.generator.generate(question, contexts)

    def answer(self, question: str, k: int = 8) -> dict:
        contexts = self.retrieve(question, k)
        answer = self.generate(question, contexts)
        return {"question": question, "contexts": contexts, "answer": answer}


def build_rag(mode: str = "mock", docs=None, guard: bool | None = None):
    docs = docs if docs is not None else DOCS
    if mode == "mock":
        return RAGSystem(KeywordRetriever(docs), RuleGenerator(guard=guard))
    from .hybrid import HybridRetriever  # 延迟导入，避免 mock 依赖重库
    return RAGSystem(HybridRetriever(docs), LLMGenerator())
