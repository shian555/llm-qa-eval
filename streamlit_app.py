"""llm-qa-eval 在线演示（Streamlit 版）。

与 FastAPI+React 完整平台共用同一套评测内核（run_eval / app.registry / rag_impl），
参考 LangSmith / Arize Phoenix 等 LLM 观测评测平台的信息架构，
提供「总览 → 运行 → 对比 → 安全 → 明细 → Playground」六页演示动线。
部署在 Streamlit Community Cloud（免费、免信用卡、国内可达）。

本地运行：
    python -m streamlit run streamlit_app.py
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import pandas as pd
import streamlit as st

from run_eval import ROOT, DATA, load_eval_set, evaluate_item, summarize, render_md
from app.registry import list_targets, build_target
from security import is_defended, is_hallucinated

st.set_page_config(page_title="llm-qa-eval · 大模型问答评测平台",
                   page_icon="🧪", layout="wide")

RUNS_DIR = ROOT / "results" / "runs"
TYPES = ("normal", "inject", "hallucination")
TYPE_LABEL = {"normal": "正常问答", "inject": "注入攻击", "hallucination": "幻觉诱导"}
SEED_A = "r-seed-rag-v1-noguard"
SEED_B = "r-seed-rag-v2-guarded"

# ---------------------------------------------------------------- 页面样式

st.markdown(
    """<style>
    .block-container {padding-top: 2.4rem; max-width: 1200px;}
    #MainMenu {visibility: hidden;} footer {visibility: hidden;}
    section[data-testid="stSidebar"] {background: #0e2440;}
    section[data-testid="stSidebar"] * {color: #dbe7f4 !important;}
    section[data-testid="stSidebar"] hr {border-color: #24466e;}
    [data-testid="stMetric"] {
        background: linear-gradient(180deg, #fbfdff, #f1f6fc);
        border: 1px solid #e2eaf4; border-radius: 12px;
        padding: 16px 18px 12px 18px;}
    [data-testid="stMetricLabel"] p {font-size: .86rem; color: #5a6b80;}
    [data-testid="stMetricValue"] {font-size: 1.65rem; color: #10304f;}
    h1, h2 {color: #10304f; letter-spacing: .5px;}
    .stDataFrame {border: 1px solid #e8eef5; border-radius: 8px;}
    </style>""",
    unsafe_allow_html=True)

# ---------------------------------------------------------------- 数据与缓存


@st.cache_data
def eval_items() -> list[dict]:
    return load_eval_set(DATA)


@st.cache_data(ttl=30)
def list_runs() -> list[dict]:
    """列出 results/runs 下全部运行（不含 items，列表页保持轻量）。"""
    if not RUNS_DIR.exists():
        return []
    runs = []
    for p in sorted(RUNS_DIR.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        runs.append({
            "file": p.name,
            "run_id": d.get("run_id", p.stem),
            "label": (d.get("target") or {}).get("label", "—"),
            "created_at": (d.get("created_at") or "")[:19].replace("T", " "),
            "note": d.get("note", ""),
            "summary": d.get("summary", {}),
        })
    runs.sort(key=lambda r: r["created_at"], reverse=True)
    return runs


@st.cache_data
def load_run(file_name: str) -> dict:
    return json.loads((RUNS_DIR / file_name).read_text(encoding="utf-8"))


@st.cache_resource
def cached_target(tid: str):
    return build_target(tid)


@st.cache_resource
def rag_system(guard: bool):
    from rag_impl import build_rag
    return build_rag("mock", guard=guard)


# ---------------------------------------------------------------- 汇总与展示工具

def pct(v) -> str:
    return "—" if v is None else f"{v * 100:.1f}%"


def build_summary(results: list[dict]) -> dict:
    """把一次评测的结果汇总成与种子运行一致的 summary 结构。"""
    by = {}
    for t in TYPES:
        rs = [r for r in results if r["type"] == t]
        n, p = len(rs), sum(int(r["passed"]) for r in rs)
        g = {"total": n, "passed": p, "pass_rate": round(p / n, 3) if n else 0.0}
        if t == "normal" and n:
            for key in ("recall", "accuracy", "citation"):
                g[f"avg_{key}"] = round(sum(r[key] for r in rs) / n, 3)
        if t == "inject":
            g.update(attack_total=n, breached=n - p,
                     asr=round((n - p) / n, 3) if n else 0.0)
        if t == "hallucination":
            g.update(hallucinated=n - p,
                     hallucination_rate=round((n - p) / n, 3) if n else 0.0)
        by[t] = g
    att, br = 30, by["inject"]["breached"] + by["hallucination"]["breached"]
    total, passed = len(results), sum(int(r["passed"]) for r in results)
    return {
        "overall": {"total": total, "passed": passed,
                    "pass_rate": round(passed / max(total, 1), 3)},
        "by_type": by,
        "dims": {k: by["normal"].get(f"avg_{k}", 0.0)
                 for k in ("recall", "accuracy", "citation")},
        "security": {"attack_total": att, "breached": br,
                     "block_rate": round(1 - br / att, 3), "asr": round(br / att, 3)},
    }


def run_picker(key: str, default_id: str | None = None) -> tuple[str, dict]:
    """运行选择器：返回 (run_id, 运行 dict)。"""
    runs = list_runs()
    id2file = {r["run_id"]: r["file"] for r in runs}
    if not id2file:
        return "", {}
    idx = list(id2file).index(default_id) if default_id in id2file else 0
    rid = st.selectbox("选择运行", list(id2file), index=idx, key=key)
    return rid, load_run(id2file[rid])


# ---------------------------------------------------------------- 侧边导航

with st.sidebar:
    st.markdown("## 🧪 llm-qa-eval")
    st.caption("大模型问答评测平台 · 在线演示")
    page = st.radio("页面", ["📊 总览", "▶️ 运行管理", "⚖️ 运行对比",
                            "🛡️ 安全评测", "🔍 明细排查", "🧪 Playground"],
                    label_visibility="collapsed")
    st.divider()
    st.caption("评测内核与 CLI / CI 完全同源（run_eval · app.registry · rag_impl）")
    st.caption("GitHub：github.com/shian555/llm-qa-eval")
    st.caption("免费层 15 分钟无访问会休眠，首次打开需等 30~60 秒唤醒")

st.title("🧪 llm-qa-eval · 大模型问答评测平台")
st.caption("建 RAG → 测 RAG → 改 RAG 闭环：内置自建 RAG 被测对象 + 检索/问答/引用三维指标 + 注入·越狱·幻觉安全评测")

# ---------------------------------------------------------------- 总览

if page == "📊 总览":
    runs = list_runs()
    inj_rates = [r["summary"].get("by_type", {}).get("inject", {}).get("pass_rate")
                 for r in runs if r["summary"]]
    inj_rates = [x for x in inj_rates if x is not None]

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("评测用例", "100 条", "正常 70 · 注入 15 · 幻觉 15", delta_color="off")
    k2.metric("运行记录", f"{len(runs)} 条")
    k3.metric("内置被测对象", f"{len(list_targets())} 种")
    k4.metric("注入平均通过率", pct(sum(inj_rates) / len(inj_rates)) if inj_rates else "—",
              "全部运行均值", delta_color="off")

    st.subheader("各运行通过率走势（旧 → 新）")
    chrono = list(reversed(runs))  # 按时间从旧到新，走势才成立
    chart = pd.DataFrame({
        "总体通过率": [r["summary"].get("overall", {}).get("pass_rate", 0) * 100 for r in chrono],
        "注入通过率": [r["summary"].get("by_type", {}).get("inject", {}).get("pass_rate", 0) * 100
                       for r in chrono],
    }, index=[r["run_id"].replace("r-seed-", "").replace("r-web-", "") for r in chrono])
    st.bar_chart(chart, height=300, stack=False, color=["#7aa6d6", "#10304f"])
    st.caption("运行对比页可任选两条运行做 A/B 深看；种子运行 r-seed-rag-v1 → v2 即「建→测→改」闭环实录。")

    left, right = st.columns([1.1, 1])
    with left:
        st.subheader("被测对象注册表")
        st.dataframe([{"目标": t["label"], "说明": t["description"],
                       "在线可测": "✅" if t["available"] or t["id"] != "real" else "需 EVAL_API_KEY"}
                      for t in list_targets()],
                     column_config={"说明": st.column_config.TextColumn(width="large")},
                     hide_index=True)
    with right:
        st.subheader("评测集构成")
        items = eval_items()
        comp = pd.DataFrame({
            "数量": [sum(1 for i in items if i["type"] == t) for t in TYPES],
        }, index=[TYPE_LABEL[t] for t in TYPES])
        st.bar_chart(comp, height=210, color="#10304f")
        st.caption("既覆盖功能正确性（正常组三维指标），也覆盖安全鲁棒性（注入 / 越狱 / 幻觉）。")

    with st.expander("🎯 面试演示动线（约 5 分钟）"):
        st.markdown(
            f"1. **⚖️ 运行对比**：A/B 默认选中 `{SEED_A}` vs `{SEED_B}`"
            " → 注入通过率 **73.3% → 100%**，「建→测→改」闭环最直观的证据\n"
            "2. **▶️ 运行管理**：现场对 mock / weak / RAG 发起一次新评测，看三维指标实时汇总\n"
            "3. **🛡️ 安全评测**：攻击成功率 / 拦截率总览 + 逐条攻击载荷判定\n"
            "4. **🔍 明细排查**：进入未通过的用例，看回答与检索片段归因\n"
            "5. **🧪 Playground**：现场发一条越狱载荷，演示护栏拦截与 v1 复现\n"
            "6. 收尾如实说明：mock / weak 是设计出来的被测对象，真实 LLM 配置 EVAL_API_KEY 后可测")

# ---------------------------------------------------------------- 运行管理

elif page == "▶️ 运行管理":
    st.subheader("运行记录")
    rows = []
    for r in list_runs():
        bt = r["summary"].get("by_type", {})
        rows.append({
            "运行 ID": r["run_id"], "被测对象": r["label"], "时间": r["created_at"],
            "总体": pct(r["summary"].get("overall", {}).get("pass_rate")),
            "正常": pct(bt.get("normal", {}).get("pass_rate")),
            "注入": pct(bt.get("inject", {}).get("pass_rate")),
            "幻觉": pct(bt.get("hallucination", {}).get("pass_rate")),
            "备注": r["note"],
        })
    st.dataframe(rows, hide_index=True,
                 column_config={"备注": st.column_config.TextColumn(width="large"),
                                "运行 ID": st.column_config.TextColumn(width="medium")})

    st.subheader("发起新评测")
    targets = list_targets()
    ids = [t["id"] for t in targets]
    tid = st.selectbox("被测对象", targets, format_func=lambda t: t["label"],
                       index=ids.index("rag") if "rag" in ids else 0)
    st.caption(tid["description"])
    if tid["id"] == "real" and not tid["available"]:
        st.info("真实 LLM 目标需要配置环境变量 EVAL_API_KEY；公开演示站点不配置，防止 Key 额度被访客消耗。")
    if st.button("🚀 开始评测（100 条 · 秒级完成）", type="primary"):
        target = cached_target(tid["id"])
        t0 = time.time()
        results = [evaluate_item(target, it, capture_contexts=True) for it in eval_items()]
        st.session_state["last_run"] = {
            "target": tid, "results": results, "summary": build_summary(results),
            "duration_ms": int((time.time() - t0) * 1000),
        }

    last = st.session_state.get("last_run")
    if last:
        st.divider()
        bt = last["summary"]["by_type"]
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("总体通过率", pct(last["summary"]["overall"]["pass_rate"]))
        m2.metric("注入通过率", pct(bt["inject"]["pass_rate"]),
                  f"被攻破 {bt['inject']['breached']}/{bt['inject']['total']}",
                  delta_color="off")
        m3.metric("幻觉拒绝率", pct(1 - bt["hallucination"]["hallucination_rate"]))
        m4.metric("评测耗时", f"{last['duration_ms']} ms")
        cdf = pd.DataFrame({
            "通过率": [bt[t]["pass_rate"] * 100 for t in TYPES],
        }, index=[TYPE_LABEL[t] for t in TYPES])
        st.bar_chart(cdf, height=240, color="#10304f")
        with st.expander("Markdown 报告"):
            st.markdown(render_md(last["results"], summarize(last["results"])))
        if st.button("💾 保存为一条运行记录"):
            ts = time.strftime("%Y%m%d-%H%M%S")
            run_id = f"r-web-{last['target']['id']}-{ts}"
            data_bytes = DATA.read_bytes()
            record = {
                "schema_version": 2, "run_id": run_id, "status": "completed",
                "target": {"id": last["target"]["id"], "label": last["target"]["label"],
                           "model": "-"},
                "dataset": {"path": "data/eval.jsonl", "size": len(data_bytes),
                            "sha1": hashlib.sha1(data_bytes).hexdigest()},
                "note": f"Streamlit 在线演示发起（{last['target']['label']}）",
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
                "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
                "duration_ms": last["duration_ms"], "partial": False, "error": None,
                "progress": {"done": 100, "total": 100},
                "summary": last["summary"], "items": last["results"],
            }
            RUNS_DIR.mkdir(parents=True, exist_ok=True)
            (RUNS_DIR / f"{run_id}.json").write_text(
                json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            st.session_state["last_run"] = None
            st.cache_data.clear()
            st.success(f"已保存：{run_id}（云端免费层磁盘随重启重置；git 内 4 条种子运行不受影响）")
            st.rerun()

# ---------------------------------------------------------------- 运行对比

elif page == "⚖️ 运行对比":
    a_id, ra = run_picker("cmp_a", default_id=SEED_A)
    b_id, rb = run_picker("cmp_b", default_id=SEED_B)
    if not a_id or not b_id:
        st.info("暂无运行记录。")
        st.stop()
    ba, bb = ra["summary"]["by_type"], rb["summary"]["by_type"]

    st.subheader("注入攻击通过率 · 安全闭环核心指标")
    m1, m2, m3 = st.columns(3)
    m1.metric(f"A ｜ {ra['run_id']}", pct(ba["inject"]["pass_rate"]),
              f"被攻破 {ba['inject']['breached']}/{ba['inject']['total']}",
              delta_color="off")
    m2.metric(f"B ｜ {rb['run_id']}", pct(bb["inject"]["pass_rate"]),
              f"被攻破 {bb['inject']['breached']}/{bb['inject']['total']}",
              delta_color="off")
    m3.metric("提升", f"{(bb['inject']['pass_rate'] - ba['inject']['pass_rate']) * 100:+.1f} pp")

    st.subheader("分组通过率对比")
    cdf = pd.DataFrame({
        "A": [ba[t]["pass_rate"] * 100 for t in TYPES],
        "B": [bb[t]["pass_rate"] * 100 for t in TYPES],
    }, index=[TYPE_LABEL[t] for t in TYPES])
    st.bar_chart(cdf, height=280, stack=False, color=["#7aa6d6", "#10304f"])
    st.dataframe([{
        "用例组": TYPE_LABEL[t],
        "A 通过": f"{ba[t]['passed']}/{ba[t]['total']}", "A 通过率": pct(ba[t]["pass_rate"]),
        "B 通过": f"{bb[t]['passed']}/{bb[t]['total']}", "B 通过率": pct(bb[t]["pass_rate"]),
        "变化": f"{(bb[t]['pass_rate'] - ba[t]['pass_rate']) * 100:+.1f} pp",
    } for t in TYPES], hide_index=True)

    st.subheader("正常组三维指标对比")
    da, db = ra["summary"]["dims"], rb["summary"]["dims"]
    dim_label = {"recall": "检索召回率", "accuracy": "问答准确率", "citation": "引用准确性"}
    ddf = pd.DataFrame({"A": [da.get(k) for k in dim_label],
                        "B": [db.get(k) for k in dim_label]}, index=list(dim_label.values()))
    st.bar_chart(ddf, height=240, stack=False, color=["#7aa6d6", "#10304f"])
    st.dataframe([{"维度": v, "A": da.get(k, "—"), "B": db.get(k, "—"),
                   "变化": f"{(db[k] - da[k]):+.3f}" if isinstance(da.get(k), (int, float))
                   and isinstance(db.get(k), (int, float)) else "—"}
                  for k, v in dim_label.items()], hide_index=True)

    if ra.get("note"):
        st.info(f"**A 版备注**：{ra['note']}")
    if rb.get("note"):
        st.info(f"**B 版备注**：{rb['note']}")

# ---------------------------------------------------------------- 安全评测

elif page == "🛡️ 安全评测":
    st.caption("安全组 = 注入攻击 15 条 + 幻觉诱导 15 条。注入组判定「模型是否拒绝执行恶意指令」，"
               "幻觉组判定「知识库外问题是否诚实拒答」。")
    rid, run = run_picker("sec_run", default_id=SEED_B)
    if not rid:
        st.info("暂无运行记录。")
        st.stop()
    sec = run["summary"]["security"]
    bt = run["summary"]["by_type"]

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("攻击拦截率", pct(sec.get("block_rate")),
              f"{sec.get('attack_total', 30)} 条攻击载荷", delta_color="off")
    m2.metric("攻击成功率 ASR", pct(sec.get("asr")), "越低越好", delta_color="off")
    m3.metric("注入通过率", pct(bt["inject"]["pass_rate"]),
              f"被攻破 {bt['inject']['breached']}/{bt['inject']['total']}",
              delta_color="off")
    m4.metric("幻觉拒答率", pct(1 - bt["hallucination"]["hallucination_rate"]),
              "知识库外问题诚实说「未找到」", delta_color="off")

    sdf = pd.DataFrame({
        "通过率": [bt["inject"]["pass_rate"] * 100, bt["hallucination"]["pass_rate"] * 100],
    }, index=["注入攻击", "幻觉诱导"])
    st.bar_chart(sdf, height=240, color="#10304f")

    st.subheader("攻击载荷库 · 逐条判定")
    inj_items = [i for i in run["items"] if i["type"] == "inject"]
    st.dataframe([{
        "#": i["index"],
        "攻击载荷": i["question"],
        "判定": "🛡️ 已防御" if i["passed"] else "⚠️ 被攻破",
        "回答摘要": (i.get("answer") or "")[:60] + ("…" if len(i.get("answer") or "") > 60 else ""),
    } for i in inj_items], hide_index=True,
        column_config={"攻击载荷": st.column_config.TextColumn(width="large"),
                       "回答摘要": st.column_config.TextColumn(width="large")})
    st.caption("判定依据 security.is_defended（拒答/拦截标记词）；已知局限：个别含标记词的正常术语"
               "（如「跨站请求伪造」）可能被误伤——这是记录在案的判定器误报面。")

# ---------------------------------------------------------------- 明细排查

elif page == "🔍 明细排查":
    rid, run = run_picker("detail_run")
    if not rid:
        st.info("暂无运行记录。")
        st.stop()
    t = st.selectbox("用例组", TYPES, format_func=lambda x: TYPE_LABEL[x])
    items = [i for i in run["items"] if i["type"] == t]
    st.caption(f"共 {len(items)} 条 ｜ 通过 {sum(int(i['passed']) for i in items)} 条")

    st.dataframe([{
        "#": i["index"], "问题": i["question"],
        "判定": "✅ 通过" if i["passed"] else "❌ 未过",
        "回答摘要": (i.get("answer") or "")[:70] + ("…" if len(i.get("answer") or "") > 70 else ""),
    } for i in items], hide_index=True,
        column_config={"问题": st.column_config.TextColumn(width="medium"),
                       "回答摘要": st.column_config.TextColumn(width="large")})

    idx = st.selectbox("单条详情", [i["index"] for i in items])
    it = next(i for i in items if i["index"] == idx)
    st.markdown(f"**问题**：{it['question']}")
    st.markdown(f"**回答**：{it.get('answer') or '（空）'}")
    if t == "normal":
        st.markdown(f"检索召回率 **{it.get('recall', '—')}** ｜ 问答准确率 "
                    f"**{it.get('accuracy', '—')}** ｜ 引用准确性 **{it.get('citation', '—')}**"
                    "（通过条件：召回 ≥ 0.5 且 准确 ≥ 0.5）")
    if t == "inject":
        st.markdown(f"is_defended：**{'True（拒绝执行恶意指令）' if it.get('defended') else 'False（被攻破）'}**")
    if t == "hallucination":
        st.markdown(f"is_hallucinated：**{'True（发生幻觉）' if it.get('hallucinated') else 'False（诚实拒答）'}**")
    if it.get("contexts"):
        with st.expander(f"检索到的上下文片段（{len(it['contexts'])} 条）"):
            for j, ctx in enumerate(it["contexts"], 1):
                st.markdown(f"**[{j}]** {ctx}")

# ---------------------------------------------------------------- Playground

else:
    st.subheader("🧪 Playground · 亲手打一次自建 RAG")
    st.caption("被测对象为 rag_impl 内置 RAG。v1（无输入护栏）时，越狱载荷会检索出含「绕过 / 伪造」"
               "等标记词的正常语料、答案被判定器记为攻破——评测真实抓到过的缺陷；"
               "v2 在生成前加了输入护栏，直接拦截。")

    inj_qs = [i["question"] for i in eval_items() if i["type"] == "inject"]
    # v1 种子运行（无护栏）中被攻破的载荷置顶并打标，保证现场演示一选就能复现
    breached: set[str] = set()
    v1 = next((r for r in list_runs() if r["run_id"] == SEED_A), None)
    if v1:
        d1 = load_run(v1["file"])
        breached = {i["question"] for i in d1["items"]
                    if i["type"] == "inject" and not i["passed"]}
    inj_qs.sort(key=lambda q: q not in breached)  # 稳定排序：可攻破的在前

    def _label(q: str) -> str:
        return ("⚡ v1 被攻破 ｜ " + q) if q in breached else q

    st.caption("演示方法：默认载荷保持「护栏 关」→ 看到被攻破；切回「护栏 开」→ 看到拦截。")
    q = st.selectbox("攻击载荷（来自评测集 inject 组）", inj_qs, format_func=_label)
    guard_on = st.radio("输入护栏", ["开（v2 修复后）", "关（复现 v1 行为）"],
                        horizontal=True).startswith("开")

    if st.button("💥 发送", type="primary"):
        sys = rag_system(guard_on)
        t0 = time.time()
        hits = sys.retrieve(q, k=8)
        ans = sys.generate(q, hits)
        st.markdown(f"**RAG 回答**：{ans}")
        if is_defended(ans):
            st.success(f"判定：🛡️ 已防御（is_defended = True ｜ 检索 + 生成耗时 "
                       f"{(time.time() - t0) * 1000:.0f} ms）")
        else:
            st.error(f"判定：⚠️ 被攻破（is_defended = False ｜ 耗时 "
                     f"{(time.time() - t0) * 1000:.0f} ms）——这正是评测抓住过的缺陷")
        with st.expander(f"检索到的上下文片段（{len(hits)} 条）"):
            for j, ctx in enumerate(hits, 1):
                st.markdown(f"**[{j}]** {ctx}")
