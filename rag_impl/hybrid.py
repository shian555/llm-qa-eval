"""真实检索：向量 + BM25 混合召回 + Rerank。

依赖（mock 模式不需要）：
    pip install sentence-transformers faiss-cpu rank-bm25 jieba
"""
from __future__ import annotations

from typing import List

from .rag import chunk_text


class HybridRetriever:
    def __init__(self, docs, chunk_size: int = 512, chunk_overlap: int = 50,
                 embed_model: str = "BAAI/bge-small-zh-v1.5",
                 rerank_model: str = "BAAI/bge-reranker-base"):
        self.chunks = []
        for d in docs:
            self.chunks += chunk_text(d["content"], chunk_size, chunk_overlap)
        self.embed_model = embed_model
        self.rerank_model = rerank_model
        self._embedder = None
        self._index = None
        self._bm25 = None
        self._reranker = None

    def _ensure_built(self):
        if self._index is not None:
            return
        import faiss
        import jieba
        import numpy as np
        from rank_bm25 import BM25Okapi
        from sentence_transformers import SentenceTransformer

        self._embedder = SentenceTransformer(self.embed_model)
        vecs = self._embedder.encode(self.chunks, normalize_embeddings=True)
        self._index = faiss.IndexFlatIP(vecs.shape[1])
        self._index.add(np.asarray(vecs, dtype="float32"))
        self._bm25 = BM25Okapi([list(jieba.cut(c)) for c in self.chunks])
        self._reranker = SentenceTransformer(self.rerank_model)

    def retrieve(self, question: str, k: int = 8) -> List[str]:
        self._ensure_built()
        import jieba
        import numpy as np

        # 向量召回
        qv = self._embedder.encode([question], normalize_embeddings=True)
        _, idx = self._index.search(np.asarray(qv, dtype="float32"), k)
        vec_hits = [self.chunks[i] for i in idx[0] if 0 <= i < len(self.chunks)]
        # BM25 召回
        bm_hits = self._bm25.get_top_n(list(jieba.cut(question)), self.chunks, n=k)
        # 合并去重
        seen, merged = set(), []
        for c in vec_hits + bm_hits:
            if c not in seen:
                seen.add(c)
                merged.append(c)
        # Rerank
        if merged:
            scores = self._reranker.predict([(question, c) for c in merged])
            return [c for c, _ in sorted(zip(merged, scores), key=lambda x: -x[1])[:k]]
        return []
