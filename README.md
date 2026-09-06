# 大模型问答系统质量评测与测试

对 RAG 问答系统做**三维质量评测 + 安全鲁棒性测试**，并把评测脚本接入 CI，实现「每次模型/索引变更自动回归」。

> 一个评测集 + 一套指标 + 一条 CI，同时证明：**会测 AI 系统**（测开岗）+ **懂 LLM 评测工程**（AI开发岗）。

## 架构

```
                    ┌──────────────────────────────┐
  data/eval.jsonl ──▶│  评测集（100 条）            │
                    │  normal / inject / hallucination │
                    └──────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
  target.py ────────▶│  被测对象适配层 QATarget      │
  (mock / real)      │  retrieve() + generate()     │
                    └──────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
  metrics.py ───────▶│  三维指标                    │
  security.py ──────▶│  召回率 / 准确率 / 引用准确率 │
                    │  注入 / 越狱 / 幻觉判定        │
                    └──────────────────────────────┘
                                    │
                                    ▼
              run_eval.py（报告） / test_eval.py（CI）
```

## 快速开始

```bash
pip install -r requirements.txt
python scripts/gen_eval_set.py     # 生成 100 条评测集
python -m pytest tests/test_eval.py -v   # 离线跑通评测（默认 mock 目标）
python run_eval.py                 # 输出 results/report.md + report.json
```

默认跑的是离线 `MockQATarget`（确定性、可复现、无需 API Key），用来验证**评测链路本身正确**。

## 接入真实 RAG / LLM

1. 把 `target.py` 里 `OpenAICompatibleTarget` 的 `retrieve_fn` 换成你自己的检索函数（如 FAISS / 混合检索）。
2. 设置环境变量（Qwen / DeepSeek / 硅基流动均兼容 OpenAI 接口）：

```bash
$env:EVAL_API_KEY="你的 Key"
$env:EVAL_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:EVAL_MODEL="qwen2.5-7b-instruct"
python run_eval.py --target real
```

## 三维指标（metrics.py）

| 指标 | 衡量 | 说明 |
|---|---|---|
| 检索召回率 `recall_at_k` | 检索质量 | gold 片段是否命中 top-k |
| 问答准确率 `answer_accuracy` | 生成质量 | 关键词命中（可升级 LLM-as-Judge） |
| 引用准确性 `citation_accuracy` | 溯源可信度 | 引文编号是否有效；完整归因建议 NLI |

## 安全测试（security.py）

- **Prompt 注入**：诱导泄露系统提示词 / 执行越权指令
- **越狱**：扮演无限制角色产出恶意内容
- **幻觉**：问知识库外内容，编造即为幻觉

## 诚实声明（面试被深挖的底气）

- 当前 `MockQATarget` 是"好"的被测对象，分数接近满分是**设计使然**，只证明链路正确。
- 接入真实 LLM 后才会暴露真实失败（幻觉、被注入攻破等）——**那才是这个项目的价值点**。
- 每个数字（召回率/准确率/通过率）都能用 `python run_eval.py` 现场复现。

## 简历 bullet（可直接套用，替换数字）

> 设计 100 条评测集，构建「检索召回率 + 问答准确率 + 引用准确性」三维评测指标；
> 覆盖 Prompt 注入、越狱、幻觉检测等鲁棒性用例；用 Pytest 编写评测脚本并接入
> GitHub Actions，实现每次模型/索引变更自动回归评测，定位并推动修复 N 处高风险问题。

## 待办 / 进阶

- [ ] 用 FAISS + BGE 替换 `retrieve_fn`，接入真实 RAG
- [ ] `answer_accuracy` 升级为 LLM-as-Judge（DeepEval / 自建裁判）
- [ ] 引用准确性升级为 NLI 归因校验
