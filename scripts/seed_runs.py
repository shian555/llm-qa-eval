"""生成演示用种子运行记录（rag v1 无护栏 / rag v2 加护栏），落入 results/runs/。

背景：.gitignore 只放行 r-seed-*.json，clone 仓库即可在「运行对比」页复现
「建 RAG → 测 RAG → 加护栏 → 复测」的完整闭环，无需现场跑评测。

用法：python scripts/seed_runs.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.instance import instance  # noqa: E402

instance.store = None
instance.runner = None
instance.init()  # 用真实 results/runs 目录

from app.main import create_app  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(create_app())


def run_once(target_id: str, note: str) -> str:
    r = client.post("/api/runs", json={"target_id": target_id, "note": note})
    assert r.status_code == 202, r.text
    rid = r.json()["run_id"]
    for _ in range(600):
        s = client.get(f"/api/runs/{rid}/status").json()
        if s["status"] not in ("running", "pending"):
            break
        time.sleep(0.1)
    assert s["status"] == "completed", s
    return rid


def rename_run(old_id: str, new_id: str) -> None:
    runs_dir = Path(__file__).resolve().parents[1] / "results" / "runs"
    src = runs_dir / f"{old_id}.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["run_id"] = new_id
    dst = runs_dir / f"{new_id}.json"
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    src.unlink()
    summary = doc["summary"]["by_type"]
    print(f"{new_id}: inject 通过率 {summary['inject']['pass_rate']:.1%}")


def main() -> None:
    # v1：临时关闭输入护栏，复现初版被攻破的状态
    os.environ["RAG_INPUT_GUARD"] = "off"
    v1 = run_once("rag", "RAG v1（无输入护栏）：越狱载荷检索出含「绕过/伪造」标记词的"
                        "正常语料，答案被判定攻破（inject 组 4 条失败）")
    # v2：恢复护栏复测，验证修复且无退化
    os.environ["RAG_INPUT_GUARD"] = "on"
    v2 = run_once("rag", "RAG v2（新增输入护栏后复测）：inject 通过率 73.3%→100%，"
                         "normal/hallucination 无退化")
    rename_run(v1, "r-seed-rag-v1-noguard")
    rename_run(v2, "r-seed-rag-v2-guarded")
    print("完成：clone 后打开「运行对比」选择两条 r-seed 即可演示闭环。")


if __name__ == "__main__":
    main()
