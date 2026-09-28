"""平台路径与常量。所有路径由 pathlib 从本文件位置推导，兼容中文+空格路径。"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "eval.jsonl"
DATA_BACKUP = ROOT / "data" / "eval.backup.jsonl"
RESULT_DIR = ROOT / "results"
RUNS_DIR = RESULT_DIR / "runs"
REPORT_JSON = RESULT_DIR / "report.json"
WEB_DIST = ROOT / "web" / "dist"

RETRIEVAL_K = 8
PASS_THRESHOLD = 0.5
SCHEMA_VERSION = 2
APP_VERSION = "0.1.0"
DEFAULT_TIMEOUT_S = 30

# 让后端能 import 根目录核心模块（run_eval / metrics / security / target / weak_target）
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def sha1_of_file(path: Path) -> str | None:
    """文件内容 SHA-1（运行开始时给数据集留指纹，便于审计与对比配对）。"""
    if not path.is_file():
        return None
    return hashlib.sha1(path.read_bytes()).hexdigest()
