"""一键评测：对被测对象跑完整评测集，输出 Markdown / JSON 报告。

用法：
    python run_eval.py                       # 默认离线 mock 目标
    python run_eval.py --target weak         # 演示用弱系统（失败可视化对比）
    python run_eval.py --target real         # 接入真实 LLM（需设 EVAL_API_KEY 等环境变量）
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from metrics import answer_accuracy, citation_accuracy, recall_at_k
from security import is_defended, is_hallucinated
from target import MockQATarget, OpenAICompatibleTarget
from weak_target import WeakQATarget

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "eval.jsonl"
RESULT_DIR = ROOT / "results"


def load_eval_set(path: Path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def evaluate_item(target, item: dict, capture_contexts: bool = False) -> dict:
    """评测单条用例。

    capture_contexts=True 时在结果里附带 top-k 检索片段（可视化平台用）；
    默认 False，CLI / pytest 的输出结构保持与历史版本完全一致。
    """
    q, t = item["question"], item["type"]
    hits = target.retrieve(q, k=8)
    ans = target.generate(q, hits)
    if t == "normal":
        r = recall_at_k(hits, item.get("docs", []))
        a = answer_accuracy(ans, item.get("answer", ""), item.get("keywords"))
        c = citation_accuracy(ans, hits)
        out = {"type": t, "question": q, "answer": ans, "recall": round(r, 3),
               "accuracy": round(a, 3), "citation": round(c, 3), "passed": r >= 0.5 and a >= 0.5}
    elif t == "inject":
        safe = is_defended(ans)
        out = {"type": t, "question": q, "answer": ans, "defended": safe, "passed": safe}
    elif t == "hallucination":
        h = is_hallucinated(ans)
        out = {"type": t, "question": q, "answer": ans, "hallucinated": h, "passed": not h}
    else:
        out = {"type": t, "question": q, "answer": ans, "passed": True}
    if capture_contexts:
        out["contexts"] = hits
    return out


def summarize(results):
    agg = defaultdict(lambda: {"n": 0, "pass": 0, "vals": defaultdict(list)})
    for r in results:
        agg[r["type"]]["n"] += 1
        agg[r["type"]]["pass"] += int(r["passed"])
        for k, v in r.items():
            if isinstance(v, (int, float)) and k not in ("passed",):
                agg[r["type"]]["vals"][k].append(v)
    return agg


def render_md(results, agg) -> str:
    lines = ["# 大模型问答系统评测报告", ""]
    lines.append(f"评测集总量：{len(results)} 条")
    lines.append("")
    for t in ("normal", "inject", "hallucination"):
        g = agg[t]
        total, ok = g["n"], g["pass"]
        lines.append(f"## {t}（{ok}/{total} 通过，通过率 {ok / total * 100:.1f}%）" if total else f"## {t}")
        if t == "normal":
            rec = sum(g["vals"]["recall"]) / max(len(g["vals"]["recall"]), 1)
            acc = sum(g["vals"]["accuracy"]) / max(len(g["vals"]["accuracy"]), 1)
            cit = sum(g["vals"]["citation"]) / max(len(g["vals"]["citation"]), 1)
            lines.append(f"- 平均检索召回率：{rec:.3f}")
            lines.append(f"- 平均问答准确率：{acc:.3f}")
            lines.append(f"- 平均引用准确性：{cit:.3f}")
        lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=["mock", "weak", "rag", "real"], default="mock")
    ap.add_argument("--data", default=str(DATA))
    args = ap.parse_args()

    if args.target == "mock":
        target = MockQATarget()
    elif args.target == "weak":
        target = WeakQATarget()
    elif args.target == "rag":
        from rag_target import RAGQATarget  # 延迟导入：mock/weak 无需加载 RAG 语料
        target = RAGQATarget()
    else:
        target = OpenAICompatibleTarget()
    items = load_eval_set(Path(args.data))
    results = [evaluate_item(target, it) for it in items]
    agg = summarize(results)

    RESULT_DIR.mkdir(exist_ok=True)
    (RESULT_DIR / "report.json").write_text(
        json.dumps({"summary": {t: dict(agg[t]) for t in agg}, "items": results},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    md = render_md(results, agg)
    (RESULT_DIR / "report.md").write_text(md, encoding="utf-8")
    print(md)
    print(f"\n报告已写出：{RESULT_DIR / 'report.json'}  {RESULT_DIR / 'report.md'}")


if __name__ == "__main__":
    main()
