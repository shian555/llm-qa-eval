"""进程级单例容器：延迟初始化 RunStore / EvalRunner（便于测试注入临时目录）。"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .runner import EvalRunner
from .store import RunStore


class Instance:
    def __init__(self) -> None:
        self.store: Optional[RunStore] = None
        self.runner: Optional[EvalRunner] = None

    def init(self, runs_dir: Path | None = None, legacy_report: Path | None = None) -> "Instance":
        if self.store is None:
            self.store = RunStore(runs_dir=runs_dir, legacy_report=legacy_report)
            self.runner = EvalRunner(self.store)
        return self


instance = Instance()
