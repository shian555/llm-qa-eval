"""被测对象注册表：mock / weak / real 的元数据、工厂与可用性探测。

available 只探测环境变量存在性，绝不回显 key 值。
"""
from __future__ import annotations

import os

from target import MockQATarget, OpenAICompatibleTarget
from weak_target import WeakQATarget
from rag_target import RAGQATarget

from .config import DEFAULT_TIMEOUT_S

REGISTRY = [
    {
        "id": "mock",
        "label": "MockQATarget（离线基线）",
        "description": "关键词检索 + 规则生成，确定性、接近满分。用于验证评测链路本身正确。",
        "requires_env": [],
    },
    {
        "id": "weak",
        "label": "WeakQATarget（演示用弱系统）",
        "description": "故意缺陷（设计出来的）：低召回 / 可被注入攻破 / 知识库外编造。"
                       "用于演示评测系统抓住失败的能力，不代表真实系统的失败分布。",
        "requires_env": [],
    },
    {
        "id": "rag",
        "label": "自建 RAG 知识库问答",
        "description": "本项目自建的 RAG 问答系统（分块 → 检索 → 带引用生成，源码见 rag_impl/）。"
                       "默认离线 mock 链路；设 RAG_MODE=real 且配置 EVAL_API_KEY 后走 BGE+FAISS+BM25 混合检索 + LLM 生成。",
        "requires_env": [],
    },
    {
        "id": "real",
        "label": "真实 LLM（OpenAI 兼容接口）",
        "description": "读取环境变量 EVAL_API_KEY / EVAL_BASE_URL / EVAL_MODEL"
                       "（默认 dashscope qwen2.5-7b-instruct）。",
        "requires_env": ["EVAL_API_KEY"],
    },
]


def get_target_meta(target_id: str) -> dict | None:
    for t in REGISTRY:
        if t["id"] == target_id:
            meta = {k: v for k, v in t.items()}
            meta["available"] = all(os.getenv(k) for k in t["requires_env"])
            return meta
    return None


def list_targets() -> list[dict]:
    return [m for m in (get_target_meta(t["id"]) for t in REGISTRY) if m]


class _TimeoutRealTarget(OpenAICompatibleTarget):
    """带单条超时 + SDK 级重试的真实目标（包装实现，不改动 target.py）。"""

    def __init__(self, timeout_s: float = DEFAULT_TIMEOUT_S, max_retries: int = 2):
        super().__init__()
        self._timeout_s = timeout_s
        self._max_retries = max_retries

    def generate(self, question, contexts):
        from openai import OpenAI  # 延迟导入，mock/weak 模式无需安装 openai

        client = OpenAI(api_key=self.api_key, base_url=self.base_url,
                        timeout=self._timeout_s, max_retries=self._max_retries)
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


def build_target(target_id: str, timeout_s: int = DEFAULT_TIMEOUT_S):
    """构造被测对象。未知 id -> KeyError；real 缺环境变量 -> ValueError。"""
    if target_id == "mock":
        return MockQATarget()
    if target_id == "weak":
        return WeakQATarget()
    if target_id == "rag":
        return RAGQATarget()
    if target_id == "real":
        if not os.getenv("EVAL_API_KEY"):
            raise ValueError("真实目标需要先配置环境变量 EVAL_API_KEY"
                             "（可选 EVAL_BASE_URL / EVAL_MODEL）")
        return _TimeoutRealTarget(timeout_s=timeout_s)
    raise KeyError(f"未知被测对象：{target_id}")
