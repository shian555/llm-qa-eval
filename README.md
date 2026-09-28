# 大模型问答系统质量评测与测试（含 Web 可视化平台）

对 RAG 问答系统做**三维质量评测 + 安全鲁棒性测试**，并把评测脚本接入 CI，实现「每次模型/索引变更自动回归」。
在此之上提供一个**一站式 Web 可视化平台**（对标 LangSmith / Promptfoo / Confident AI 的核心工作流）：
发起评测 → 过程可视化 → 结果下钻 → 版本对比 → 安全复盘 → 数据集管理。

> 一个评测集 + 一套指标 + 一条 CI + 一个可视化平台，同时证明：**会测 AI 系统**（测开岗）+ **懂 LLM 评测工程**（AI开发岗）+ **有全栈交付能力**。

> **🌐 在线 Demo**：https://llm-qa-eval.onrender.com （Render 免费层，首次访问冷启动约 1 分钟）

## 「建 RAG → 测 RAG → 改 RAG」完整闭环（自建系统实测）

本平台的被测对象不只是 mock：内置自建 RAG 知识库问答系统（`rag_impl/`：
分块 → 检索 → 带引用生成），
并真实发生过一次「评测发现缺陷 → 修复 → 复测验证」：

| 运行 | inject 组通过率 | 归因 |
|---|---|---|
| RAG v1（无输入护栏） | **73.3%**（11/15） | 越狱载荷照样走完检索+生成，命中含「绕过/伪造」标记词的正常语料（WAF/CSRF 文档），答案被判定攻破 |
| RAG v2（新增输入护栏） | **100%**（15/15） | normal（70/70）/ hallucination（15/15）无退化，全部 223 项测试通过 |

复现：

```bash
python run_eval.py --target rag                      # 复测（输入护栏默认开启）
RAG_INPUT_GUARD=off python run_eval.py --target rag  # 复现 v1：关闭护栏
python scripts/seed_runs.py                          # 重新生成演示种子运行（运行对比页可见 A/B）
```

> 方法学备注：v1 的 4 条失败同时暴露了判定器的误报面——`is_defended` 的标记词（如「伪造」）
> 会命中「跨站请求伪造」这类正常安全术语。本次修复落在被测系统（加输入护栏）而非放宽裁判；
> 裁判误报面作为已知局限如实记录。

## Web 可视化平台（新增）

### 一键启动（生产模式）

```bash
pip install -r requirements.txt
cd web && npm install && npm run build && cd ..
scripts\start_backend.bat        # Windows；或 python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

浏览器打开 **http://127.0.0.1:8000** 即可。前端已构建为静态资源由 FastAPI 托管（SPA 深链接全部可达），开发时可用 `scripts\start_dev.bat`（Vite 热更新 :5173 + FastAPI :8000）。

### 在线部署（Render 免费层）

仓库内置 `render.yaml`（Blueprint），`web/dist` 已提交入库（托管端免 Node 构建）：
Render Dashboard → **New + → Blueprint** → 选择本仓库 → Apply，约 3~5 分钟完成部署。

- 免费层限制：不活跃 15 分钟休眠，首次访问冷启动约 30~60 秒；磁盘随重启重置，运行历史回到 git 内置的 4 条 `r-seed-*` 种子，演示故事线不受影响。
- 真实 LLM 模式：在 Render 环境变量配置 `EVAL_API_KEY` 即可启用（公开链接任何人可发起评测、消耗 Key 额度，建议保持本地）。

### 平台架构

```
React 18 + AntD 5 + ECharts（web/，构建产物由 FastAPI 托管）
        │  REST /api/*
FastAPI 服务层（app/：路由 · 单飞锁 · 协作式取消 · 原子写盘）
        │  直接复用，不重写
评测核心（run_eval · metrics · security · target · weak_target · rag_target + rag_impl）
        │
results/runs/*.json（schema v2，历史 report.json 自动迁移）
```

- **评测执行**：后台线程运行，1s 轮询进度，可随时协作式取消；同一时刻仅允许一个评测（409 冲突）。
- **被测对象注册表**：`MockQATarget`（确定性基线）/ `WeakQATarget`（缺陷演示）/ `RAGQATarget`（自建 RAG 知识库，见上节）/ `OpenAICompatibleTarget`（真实 LLM，需 `EVAL_API_KEY`，仅做存在性检测，不回显 Key）。
- **存储**：JSON 文件（`results/runs/`），原子写入；启动时自动迁移旧的 `results/report.json` 为 `r-legacy-mock-0001`；服务异常退出后残留的 running 记录自动标记 `interrupted`。

### 七个页面

| 页面 | 内容 |
|---|---|
| 总览 Dashboard | 6 项 KPI、三维雷达、类型分布、历史趋势、分类型通过率、最近运行 |
| 运行管理 | 发起评测（目标选择/备注）、运行列表、实时进度与取消、详情页（仪表盘/分类型堆叠柱/雷达/分数分布直方图 + 100 条明细按类型/判定/关键词筛选，行抽屉展示检索片段与逐项得分） |
| 运行对比 | 任选两次运行 A/B：KPI 变化（pp）、双系列雷达、分类型对比、用例级差异表（退化/改善 Tab，可分别打开 A/B 详情） |
| 数据集管理 | 三类用例增删改（按类型差异化校验）、搜索筛选、与内置版本比对、一键重新生成（自动备份 .bak） |
| Red Team | 攻防视角复盘：注入/越狱/幻觉三组 ASR 与明细，逐条查看被攻破答案 |
| Playground | 单条试跑：任选目标 + top-k 调节，即时展示检索片段、答案引文高亮、gold 命中/三维指标/安全判定；内置话题与攻击载荷一键填入 |
| About | 平台架构图、评测方法学与判定口径、运行环境、GitHub Actions 徽章、WeakQATarget 诚实声明 |

### 面试演示动线（约 5 分钟）

1. **Dashboard**：选 legacy(mock) 快照 → 满分基线，说明指标口径。
2. **运行管理**：发起一次 WeakQATarget 评测 → 实时进度 → 详情页 15% 通过率，点开一条幻觉用例看「编造答案 + 越界引用 [9]」的归因证据。
3. **Red Team**：注入组 ASR 100%，逐条展示被攻破答案的 defeat markers。
4. **运行对比**：A=r-seed-rag-v1-noguard、B=r-seed-rag-v2-guarded → 注入通过率 73.3%→100%（+26.7pp），点开退化/改善明细看逐条归因；再对比 weak vs mock 演示 +85pp。
5. **Playground**：现场点击攻击载荷 → 实时演示被攻破路径（如实说明 WeakQATarget 的缺陷是设计出来的，用于无 Key 环境演示归因能力；接真实 LLM 只需 `EVAL_API_KEY`）。
6. **About**：架构图 + 方法学收尾。

> 诚实声明：`WeakQATarget` 是刻意实现四类失败路径（DDoS 可答 / 其他话题回避 / 范围外编造"答案是：42"+越界引用 / 注入即破）的确定性被测对象，便于离线复现与演示；mock 满分与 weak 15% 均为设计使然，真实水平以接入 `real` 目标为准。

## CLI / pytest / CI（原有能力，完整保留）

### 架构

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
python run_eval.py --target rag    # 被测对象换成自建 RAG（离线，见上方闭环一节）
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

- [x] 接入真实 RAG：自建系统已 vendored 进 `rag_impl/`（mock 链路默认；`RAG_MODE=real` + 重依赖可本地开启 BGE+FAISS+BM25+Rerank 混合检索）
- [x] Render 免费层部署（render.yaml Blueprint，见「在线部署」）
- [ ] `answer_accuracy` 升级为 LLM-as-Judge（DeepEval / 自建裁判）
- [ ] 引用准确性升级为 NLI 归因校验
- [ ] 输入护栏从词表升级为轻量分类器；`is_defended` 标记词误报面收敛（见方法学备注）
