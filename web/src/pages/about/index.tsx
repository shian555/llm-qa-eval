import { Alert, Button, Card, Col, Descriptions, Row, Space, Statistic, Typography } from 'antd'
import { GithubOutlined } from '@ant-design/icons'
import { getSystemCi, getSystemInfo } from '../../api'
import { useAsync } from '../../hooks/useAsync'

interface SystemInfo {
  app_version: string
  python_version: string
  platform: string
  dataset_size: number
  runs_count: number
}

// 平台架构图（内联 SVG，便于导出与离线展示）
function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, h: number, fill: string, title: string, sub: string) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke="rgba(0,0,0,0.12)" />
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1f1f1f">
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize={11} fill="rgba(0,0,0,0.55)">
        {sub}
      </text>
    </g>
  )
  const arrow = (x1: number, y1: number, x2: number, y2: number, label?: string) => (
    <g key={`${x1}-${y1}-${x2}-${y2}`}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0.35)" strokeWidth={1.4} markerEnd="url(#arrow)" />
      {label && (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={10} fill="rgba(0,0,0,0.5)">
          {label}
        </text>
      )}
    </g>
  )
  return (
    <svg viewBox="0 0 880 470" style={{ width: '100%', height: 'auto' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" markerWidth={8} markerHeight={8} refX={7} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(0,0,0,0.35)" />
        </marker>
      </defs>

      {/* 前端层 */}
      {box(40, 30, 800, 64, '#f0f5ff', 'Web 控制台（React 18 + Ant Design 5 + ECharts）', '总览 Dashboard · 运行管理 · 运行对比 · 数据集管理 · Red Team · Playground · About')}
      {arrow(440, 94, 440, 132, 'REST /api/*（JSON）')}

      {/* API 层 */}
      {box(40, 132, 800, 64, '#fff7e6', 'FastAPI 服务层（app/）', 'runs · overview · compare · dataset · security · playground · system —— 单飞锁、协作式取消、原子写盘')}

      {/* 核心 */}
      {arrow(300, 196, 300, 240)}
      {arrow(580, 196, 580, 240, '复用 CLI 核心模块（不重写评测逻辑）')}
      {box(40, 240, 380, 70, '#f6ffed', '评测执行 EvalRunner', '后台线程 + 进度/取消 + results/runs/*.json')}
      {box(460, 240, 380, 70, '#f6ffed', '评测核心（根目录模块）', 'run_eval · metrics · security · target · weak_target')}

      {/* 目标与数据 */}
      {arrow(180, 310, 180, 350)}
      {arrow(650, 310, 650, 350)}
      {box(40, 350, 380, 84, '#fff1f0', '被测对象 Targets', 'MockQATarget（确定性基线） · WeakQATarget（缺陷演示） · OpenAICompatibleTarget（真实 LLM）')}
      {box(460, 350, 380, 84, '#f9f0ff', '数据与结果', 'data/eval.jsonl（100 条三类用例） · results/runs/（schema v2） · data/kb.jsonl（知识库）')}
    </svg>
  )
}

const METRICS = [
  {
    title: '检索召回率（recall）',
    desc: 'top-k 检索片段中是否包含 gold 片段及其排名，得分 = 1/rank（未命中 0）。',
  },
  {
    title: '问答准确率（accuracy）',
    desc: '模型答案对判定关键词的命中率（简单稳健的词面判定，可复现、可离线跑）。',
  },
  {
    title: '引用准确性（citation）',
    desc: '答案中 [n] 引用编号是否落在本次检索返回的片段范围内，防“虚假引用”。',
  },
  {
    title: '安全判定（defended / hallucinated）',
    desc: '注入/越狱用检查 defeat markers（复述系统提示、声称被绕过等）；幻觉探针检查是否对范围外问题编造确定性答案。',
  },
]

export default function AboutPage() {
  const info = useAsync(() => getSystemInfo() as unknown as Promise<SystemInfo>, [])
  const ci = useAsync(getSystemCi, [])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" title="平台定位" className="section-card">
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          <strong>LLM 问答质量与安全评测平台</strong>
          ：面向 RAG 问答系统的三维度质量评测（检索召回 / 问答准确 / 引用准确）加安全与鲁棒性
          测试（提示注入 / 越狱 / 幻觉探针）的一站式工作台，对标 LangSmith、Promptfoo、Confident AI
          的核心工作流：发起评测 → 过程可视化 → 结果下钻 → 版本对比 → 安全复盘。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          后端完整复用仓库既有的 CLI 评测核心（run_eval / metrics / security / target），Web
          平台是它的“宿主”而非重写；同一套代码同时支持命令行、pytest 与 CI。
        </Typography.Paragraph>
      </Card>

      <Card size="small" title="平台架构" className="section-card">
        <ArchitectureDiagram />
      </Card>

      <Card size="small" title="评测方法学" className="section-card">
        <Row gutter={16}>
          {METRICS.map((m) => (
            <Col span={6} key={m.title}>
              <Card size="small" style={{ height: '100%', background: '#fafafa' }}>
                <Typography.Text strong>{m.title}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0, marginTop: 6 }}>
                  {m.desc}
                </Typography.Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="判定口径"
          description="功能问答：gold 命中（recall>0）且关键词命中率 ≥ 阈值且引用编号全部有效，三条同时满足才判通过。注入/越狱：未检出 defeat markers 即通过。幻觉探针：明确拒答/说明不知道才通过。全部判定为确定性规则，无 LLM-as-judge，保证可复现。"
        />
      </Card>

      <Row gutter={16}>
        <Col span={14}>
          <Card size="small" title="运行环境" className="section-card" loading={info.loading}>
            {info.data && (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}><Statistic title="数据集用例" value={info.data.dataset_size} /></Col>
                  <Col span={6}><Statistic title="累计运行" value={info.data.runs_count} /></Col>
                </Row>
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  items={[
                    { key: 'v', label: '平台版本', children: info.data.app_version },
                    { key: 'py', label: 'Python', children: info.data.python_version },
                    { key: 'os', label: '操作系统', children: info.data.platform },
                  ]}
                />
              </>
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" title="CI 状态" className="section-card" loading={ci.loading}>
            {ci.data?.badge_url ? (
              <Space direction="vertical" size={12}>
                <img src={ci.data.badge_url} alt="eval workflow status" style={{ maxWidth: 260 }} />
                <Button
                  type="link"
                  icon={<GithubOutlined />}
                  href={ci.data.actions_url ?? undefined}
                  target="_blank"
                  style={{ padding: 0 }}
                >
                  在 GitHub Actions 中查看评测流水线
                </Button>
              </Space>
            ) : (
              <Typography.Text type="secondary">
                未检测到 GitHub 远端仓库。推送至 GitHub 并启用 <span className="mono">.github/workflows/eval.yml</span> 后，此处会显示评测流水线徽章。
              </Typography.Text>
            )}
          </Card>
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="关于 WeakQATarget 的诚实声明"
            description="平台中的 WeakQATarget 是刻意实现缺陷的确定性被测对象（4 类失败路径），用于在无真实 LLM 的环境下演示评测、归因与对比能力；它不代表真实模型水平，面试演示时建议如实说明。"
          />
        </Col>
      </Row>

      <Card size="small" title="技术栈" className="section-card">
        <Space wrap size={8}>
          {['FastAPI', 'Uvicorn', 'Pydantic v2', 'React 18', 'TypeScript', 'Vite 5', 'Ant Design 5', 'ECharts 5', 'React Router 6', 'axios', 'pytest'].map((t) => (
            <Typography.Text key={t} code style={{ fontSize: 12 }}>
              {t}
            </Typography.Text>
          ))}
        </Space>
      </Card>
    </Space>
  )
}
