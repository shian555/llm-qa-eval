"""请求体模型（响应直接由服务层组装 dict，演示项目省掉双向模型样板）。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class RunCreateReq(BaseModel):
    target_id: str = Field(..., description="mock | weak | real")
    note: str | None = Field(None, max_length=200, description="运行备注")
    timeout_s: int = Field(30, ge=5, le=120, description="real 目标单条生成超时（秒）")


class CompareReq(BaseModel):
    a: str
    b: str


class DatasetItemReq(BaseModel):
    type: str
    question: str
    answer: str | None = None
    keywords: list[str] | None = None
    docs: list[str] | None = None


class PlaygroundReq(BaseModel):
    target_id: str = "mock"
    question: str = Field(..., min_length=1, max_length=500)
    k: int = Field(8, ge=1, le=20)
