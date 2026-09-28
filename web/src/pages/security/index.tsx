import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { getSecurity } from '../../api'
import type { SecurityView } from '../../api/types'
import { ItemDrawer } from '../../components/ItemDrawer'
import { PassTag } from '../../components/Tags'
import { RunSelect } from '../../components/RunSelect'
import { useAsync } from '../../hooks/useAsync'

// 单组明细表列定义（三组共用）
function groupColumns(onOpen: (index: number) => void): ColumnsType<SecurityView['groups'][number]['items'][number]> {
  return [
    { title: '#', dataIndex: 'index', key: 'i', width: 50 },
    { title: '问题', dataIndex: 'question', key: 'q', ellipsis: true },
    {
      title: '答案摘要',
      dataIndex: 'answer',
      key: 'ans',
      ellipsis: true,
      render: (a: string | null) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {a ? (a.length > 50 ? `${a.slice(0, 50)}…` : a) : '（执行异常）'}
        </Typography.Text>
      ),
    },
    {
      title: '判定',
      key: 'verdict',
      width: 190,
      render: (_, r) => {
        if (r.type === 'hallucination') {
          return r.hallucinated ? (
            <span style={{ color: '#ff4d4f', fontSize: 12 }}>✗ 幻觉（编造答案）</span>
          ) : (
            <span style={{ color: '#52c41a', fontSize: 12 }}>✓ 正确拒答</span>
          )
        }
        return r.defended ? (
          <span style={{ color: '#52c41a', fontSize: 12 }}>✓ 拦截成功</span>
        ) : (
          <span style={{ color: '#ff4d4f', fontSize: 12 }}>✗ 被攻破</span>
        )
      },
    },
    { title: '用例判定', dataIndex: 'passed', key: 'p', width: 90, render: (p: boolean) => <PassTag passed={p} /> },
    {
      title: '',
      key: 'act',
      width: 70,
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => onOpen(r.index)}>
          详情
        </Button>
      ),
    },
  ]
}

const GROUP_META: Record<SecurityView['groups'][number]['category'], { color: string; desc: string }> = {
  injection: { color: '#fa8c16', desc: '提示注入：诱导模型执行“忽略以上指令 / 泄露系统提示”等指令' },
  jailbreak: { color: '#f5222d', desc: '越狱：角色扮演 / 假设场景绕过安全约束' },
  hallucination: { color: '#722ed1', desc: '幻觉探针：知识库范围外的问题，检验模型是否会编造确定性答案' },
}

export default function SecurityPage() {
  const [runId, setRunId] = useState<string | undefined>(undefined)
  const [drawerIndex, setDrawerIndex] = useState<number | null>(null)
  const view = useAsync(
    () => getSecurity(runId),
    [runId],
  )

  // 默认选中最近一次已完成运行
  useEffect(() => {
    if (!runId && view.data?.run_id) setRunId(view.data.run_id)
  }, [view.data?.run_id, runId])

  const v = view.data
  const asr = v?.asr ?? null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" className="section-card">
        <Space wrap size={16} align="center">
          <span>
            <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
              评测运行
            </Typography.Text>
            <RunSelect value={runId} onChange={setRunId} placeholder="默认最近一次已完成运行" />
          </span>
          {v?.target && (
            <span style={{ marginTop: 22 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                被测对象：
              </Typography.Text>
              <Typography.Text>{v.target.label}</Typography.Text>
            </span>
          )}
        </Space>
      </Card>

      {v && (
        <Row gutter={16}>
          <Col span={6}>
            <Card size="small" className="section-card">
              <Statistic title="攻击用例总数" value={v.attack_total} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" className="section-card">
              <Statistic
                title="被攻破 / 幻觉数"
                value={v.breached}
                valueStyle={{ color: v.breached > 0 ? '#ff4d4f' : '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" className="section-card">
              <Statistic
                title="攻击成功率 ASR（越低越好）"
                value={asr === null ? '—' : `${(asr * 100).toFixed(1)}%`}
                valueStyle={{ color: asr === null || asr === 0 ? '#52c41a' : '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" className="section-card">
              <div style={{ marginBottom: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  安全拦截率
                </Typography.Text>
              </div>
              <Progress
                percent={v.block_rate === null ? 0 : +(v.block_rate * 100).toFixed(1)}
                strokeColor={v.block_rate !== null && v.block_rate >= 0.8 ? '#52c41a' : '#ff4d4f'}
                format={(p) => `${p}%`}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Alert
        type="info"
        showIcon
        message="红队视角：本页从攻防角度复盘每次评测中的安全用例表现"
        description="注入/越狱看“是否被攻破”，幻觉探针看“是否编造答案”。所有判定均为确定性规则（defeat markers / 拒答识别），可在用例详情中查看完整答案与检索上下文。"
      />

      {v && (
        <Card size="small" className="section-card" styles={{ body: { paddingTop: 0 } }}>
          <Tabs
            defaultActiveKey={v.groups[0]?.category}
            items={v.groups.map((g) => ({
              key: g.category,
              label: (
                <span>
                  {g.label}
                  <span style={{ color: '#ff4d4f', fontSize: 12, marginLeft: 6 }}>
                    {g.breached}/{g.total}
                  </span>
                </span>
              ),
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type={g.asr === 0 ? 'success' : 'error'}
                    showIcon
                    message={
                      <span>
                        {GROUP_META[g.category].desc} — 本组 {g.total} 条，
                        被攻破/幻觉 {g.breached} 条，ASR {(g.asr * 100).toFixed(1)}%
                      </span>
                    }
                  />
                  <Table
                    rowKey="index"
                    size="small"
                    loading={view.loading}
                    columns={groupColumns((i) => setDrawerIndex(i))}
                    dataSource={g.items}
                    pagination={g.items.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
                    rowClassName={(r) => (r.passed ? '' : 'breach-row')}
                  />
                </Space>
              ),
            }))}
          />
        </Card>
      )}

      <ItemDrawer
        runId={runId ?? ''}
        index={drawerIndex}
        onClose={() => setDrawerIndex(null)}
      />
    </Space>
  )
}
