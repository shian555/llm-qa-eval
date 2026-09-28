import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Input,
  Row,
  Slider,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { SendOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { App } from 'antd'
import { getKb, playground } from '../../api'
import type { PlaygroundResult } from '../../api/types'
import { renderCitations } from '../../components/AnswerText'
import { TargetRadio } from '../../components/TargetRadio'
import { useAsync } from '../../hooks/useAsync'

export default function PlaygroundPage() {
  const { message } = App.useApp()
  const kb = useAsync(getKb, [])
  const [targetId, setTargetId] = useState('weak')
  const [question, setQuestion] = useState('什么是DDoS？')
  const [k, setK] = useState(8)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PlaygroundResult | null>(null)

  const run = async (q?: string) => {
    const questionToUse = (q ?? question).trim()
    if (!questionToUse) {
      message.warning('请输入问题')
      return
    }
    setLoading(true)
    try {
      const r = await playground({ target_id: targetId, question: questionToUse, k })
      setResult(r)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const m = result?.metrics

  return (
    <Row gutter={16}>
      <Col span={15}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small" title="单条试跑" className="section-card">
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  被测对象
                </Typography.Text>
                <TargetRadio value={targetId} onChange={setTargetId} />
              </div>
              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  检索条数 top-k：{k}
                </Typography.Text>
                <Slider min={1} max={12} value={k} onChange={setK} style={{ maxWidth: 420 }} marks={{ 1: '1', 4: '4', 8: '8', 12: '12' }} />
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="large"
                  placeholder="输入问题或攻击载荷，直接试跑被测对象"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onPressEnter={() => run()}
                />
                <Button type="primary" size="large" icon={<SendOutlined />} loading={loading} onClick={() => run()}>
                  试跑
                </Button>
              </Space.Compact>
            </Space>
          </Card>

          {loading && (
            <Card className="section-card">
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin tip="正在检索并生成答案…" />
              </div>
            </Card>
          )}

          {result && !loading && (
            <Card size="small" title="试跑结果" className="section-card">
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                {result.error && <Alert type="error" showIcon message="调用失败" description={result.error} />}

                {m && (
                  <Row gutter={12}>
                    <Col span={6}>
                      <Statistic
                        title="gold 命中"
                        value={m.gold_found ? '是' : '否'}
                        valueStyle={{ color: m.gold_found ? '#52c41a' : '#ff4d4f' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic title="检索召回率" value={m.recall === null ? '—' : m.recall.toFixed(3)} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="问答准确率" value={m.accuracy === null ? '—' : m.accuracy.toFixed(3)} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="引用准确性" value={m.citation === null ? '—' : m.citation.toFixed(3)} />
                    </Col>
                  </Row>
                )}

                {result.security && (
                  <Space wrap>
                    <Tag color={result.security.defended ? 'green' : 'red'}>
                      {result.security.defended ? '未检测到注入痕迹（守住）' : '检测到 defeat markers（被攻破）'}
                    </Tag>
                    <Tag color={result.security.hallucinated ? 'red' : 'green'}>
                      {result.security.hallucinated ? '疑似幻觉（编造答案）' : '未检测到幻觉'}
                    </Tag>
                  </Space>
                )}

                <div>
                  <Typography.Text type="secondary">模型答案</Typography.Text>
                  <Typography.Paragraph className="answer-text" style={{ marginBottom: 0 }}>
                    {result.answer ? renderCitations(result.answer) : '（空答案）'}
                  </Typography.Paragraph>
                </div>

                <div>
                  <Typography.Text type="secondary">检索片段（top-{k}）</Typography.Text>
                  {result.contexts === null || result.contexts.length === 0 ? (
                    <Typography.Paragraph type="warning" style={{ marginBottom: 0 }}>
                      检索结果为空
                    </Typography.Paragraph>
                  ) : (
                    <Collapse
                      size="small"
                      items={result.contexts.map((c, i) => ({
                        key: i,
                        label: (
                          <span>
                            <span className="cite-mark mono">[{i + 1}]</span> {c.length > 60 ? `${c.slice(0, 60)}…` : c}
                          </span>
                        ),
                        children: <Typography.Paragraph style={{ marginBottom: 0 }}>{c}</Typography.Paragraph>,
                      }))}
                    />
                  )}
                </div>

                {m?.note && <Alert type="info" showIcon message={m.note} />}

                <Descriptions
                  size="small"
                  column={2}
                  items={[
                    { key: 'lat', label: '耗时', children: result.latency_ms === null ? '—' : `${result.latency_ms} ms` },
                    { key: 'q', label: '问题', children: result.question },
                  ]}
                />
              </Space>
            </Card>
          )}
        </Space>
      </Col>

      <Col span={9}>
        <Card
          size="small"
          title="知识库话题（点击快速填入）"
          className="section-card"
          loading={kb.loading}
        >
          <Space wrap>
            {(kb.data?.topics ?? []).map((t) => (
              <Button key={t.keyword} size="small" onClick={() => { setQuestion(t.question); void run(t.question) }}>
                {t.keyword}
              </Button>
            ))}
          </Space>
        </Card>

        <Card
          size="small"
          title={
            <Space>
              <ThunderboltOutlined style={{ color: '#f5222d' }} />
              攻击载荷样例（点击快速试跑）
            </Space>
          }
          className="section-card"
          style={{ marginTop: 16 }}
          loading={kb.loading}
        >
          {(['injection', 'jailbreak', 'hallucination'] as const).map((cat) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {cat === 'injection' ? '提示注入' : cat === 'jailbreak' ? '越狱' : '幻觉探针'}
              </Typography.Text>
              <Space wrap style={{ marginTop: 6 }}>
                {(kb.data?.attacks[cat] ?? []).slice(0, 4).map((s) => (
                  <Button key={s} size="small" danger={cat !== 'hallucination'} onClick={() => { setQuestion(s); void run(s) }}>
                    <Typography.Text style={{ maxWidth: 240, fontSize: 12 }} ellipsis>
                      {s}
                    </Typography.Text>
                  </Button>
                ))}
              </Space>
            </div>
          ))}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            提示：选 WeakQATarget 并点击任意载荷，可现场演示“被攻破/幻觉”路径；这是刻意设计的确定性缺陷目标，用于展示评测框架的判定与归因能力。
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  )
}
