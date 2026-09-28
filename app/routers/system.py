"""系统信息与 CI 状态（About 页用）。"""
from __future__ import annotations

import platform
import re
import subprocess

from fastapi import APIRouter

from run_eval import load_eval_set

from ..config import APP_VERSION, DATA_FILE, ROOT
from ..instance import instance

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/info")
def info():
    return {
        "app_version": APP_VERSION,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "dataset_size": len(load_eval_set(DATA_FILE)) if DATA_FILE.is_file() else 0,
        "runs_count": len(instance.store.list_meta()),
    }


@router.get("/ci")
def ci():
    """从 git origin 解析 GitHub 仓库，给出 Actions 徽章地址；本地无 remote 时返回 null。"""
    try:
        r = subprocess.run(["git", "remote", "get-url", "origin"], cwd=ROOT,
                           capture_output=True, text=True, timeout=5)
        url = (r.stdout or "").strip() if r.returncode == 0 else ""
    except Exception:
        url = ""
    m = re.search(r"github\.com[:/](.+?/.+?)(?:\.git)?/?$", url)
    if not m:
        return {"remote_url": url or None, "badge_url": None, "actions_url": None}
    slug = m.group(1)
    workflow = f"https://github.com/{slug}/actions/workflows/eval.yml"
    return {
        "remote_url": url,
        "badge_url": workflow + "/badge.svg",
        "actions_url": workflow,
    }
