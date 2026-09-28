import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { cancelRun, getRun, getRunItems, getRunStatus } from '../../api'
import type { ItemType, RunItem, RunMeta, RunStatusInfo } from '../../api/types'
import { EChart } from '../../components/EChart'
import { ItemDrawer } from '../../components/ItemDrawer'
import { PassTag, TypeTag } from '../../components/Tags'
import { RunProgress } from '../../components/RunProgress'
import { useAsync } from '../../hooks/useAsync'
import { usePolling } from '../../hooks/usePolling'
import { fmtDuration, fmtTime, pct, score, scoreTone } from '../../utils/format'

const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted']

// 分数分布直方图数据（从全量明细统计）
function histogramOption(items: RunItem[]): EChartsOption {
  const buckets = ['[0,0.2)', '[0.2,0.4)', '[0.4,0.6)', '[0.6,0.8)', '[0.8,1]']
  const bucketOf = (v: number) => Math.min(4, Math.floor(v / 0.2))
  const series = (['recall', 'accuracy', 'citation'] as const).map((k) => {
    const counts = [0, 0, 0, 0, 0]
    items.forEach((it) => {
      if (it.scores && it.scores[k] !== null) counts[bucketOf(it.scores[k])] += 1
    })
    return {
      name: { recall: '检索召回', accuracy: '问答准确', citation: '引用准确' }[k],
      type: 'bar' as const,
      data: counts,
      color: { recall: '#2f54eb', accuracy: '#52c41a', citation: '#fa8c16' }[k],
    }
  })
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 40, right: 16, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: buckets },
    yAxis: { type: 'value', minInterval: 1 },
    series,
  }
}

export default function RunDetailPage() {
  const { runId = '' } = useParams()
  const { message } = App.useApp()
  const navigate = useNavigate()

  const meta = useAsync(() => getRun(runId), [runId])
  const run = meta.data
  const isRunning = run !== null && !TERMINAL.includes(run.status)

  // 运行中：轮询轻量进度；终态后刷新 meta
  const statusPoll = usePolling<RunStatusInfo | { error: string }>(
    () =>
      getRunStatus(runId).catch(() => ({ error: '获取进度失败', run_id: '', status: 'failed', progress: { done: 0, total: 0 }, current_question: null, elapsed_ms: null })),
    { intervalMs: 1000, deps: [runId], stopWhen: (d) => 'error' in d || TERMINAL.includes((d as RunStatusInfo).status) },
  )
  const [cancelling, setCancelling] = useState(false)
  const liveStatus = 'error' in (statusPoll.data ?? {}) ? null : (statusPoll.data as RunStatusInfo | null)

  useEffect(() => {
    if (liveStatus && TERMINAL.includes(liveStatus.status)) {
      void meta.reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus?.status])

  const onCancel = async () => {
    setCancelling(true)
    try {
      await cancelRun(runId)
      message.info('已发送取消指令，正在等待当前用例结束')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  // 明细表：服务端筛选分页
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [passFilter, setPassFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const items = useAsync(
    () =>
      getRunItems(runId, {
        type: typeFilter === 'all' ? undefined : typeFilter,
        passed: passFilter === 'all' ? undefined : passFilter === 'passed',
        q: query || undefined,
        page,
        page_size: 20,
      }),
    [runId, typeFilter, passFilter, query, page],
  )
  useEffect(() => setPage(1), [typeFilter, passFilter, query])

  // 完成后取全量明细画分布直方图
  const allItems = useAsync(
    async () => (run?.status === 'completed' ? (await getRunItems(runId, { page: 1, page_size: 200 })).items : []),
    [runId, run?.status],
  )

  const [drawerIndex, setDrawerIndex] = useState<number | null>(null)

  const summaryCharts = useMemo(() => {
    const s = run?.summary
    if (!s) return null
    const passRate = s.overall.pass_rate ?? 0
    const gauge: EChartsOption = {
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: '95%',
          progress: { show: true, width: 14, itemStyle: { color: scoreTone(s.overall.pass_rate) } },
          axisLine: { lineStyle: { width: 14, color: [[1, '#f0f0f0']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          detail: {
            formatter: () => `${(passRate * 100).toFixed(1)}%`,
            fontSize: 26,
            offsetCenter: [0, 0],
            color: scoreTone(s.overall.pass_rate),
          },
          data: [{ value: +(passRate * 100).toFixed(1) }],
        },
      ],
    }
    const byType = ['normal', 'inject', 'hallucination'].map((t) => s.by_type[t])
    const stack: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 40, right: 16, top: 24, bottom: 52 },
      xAxis: { type: 'category', data: ['功能问答', '注入/越狱', '幻觉探针'] },
      yAxis: { type: 'value' },
      series: [
        {
          name: '通过',
          type: 'bar',
          stack: 'x',
          color: '#52c41a',
          data: byType.map((b) => b.passed),
        },
        {
          name: '失败',
          type: 'bar',
          stack: 'x',
          color: '#ff4d4f',
          data: byType.map((b) => b.total - b.passed),
        },
      ],
    }
    const radar: EChartsOption = {
      radar: {
        indicator: [
          { name: '检索召回', max: 1 },
          { name: '问答准确', max: 1 },
          { name: '引用准确', max: 1 },
        ],
        radius: '62%',
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: [
                s.dims.recall ?? 0,
                s.dims.accuracy ?? 0,
                s.dims.citation ?? 0,
              ],
              areaStyle: { color: 'rgba(47,84,235,0.25)' },
              itemStyle: { color: '#2f54eb' },
            },
          ],
        },
      ],
    }
    return { gauge, stack, radar }
  }, [run])

  if (meta.error) {
    return <Alert type="error" showIcon message="运行不存在或读取失败" description={meta.error}
      action={<Button onClick={() => navigate('/runs')}>返回列表</Button>} />
  }

  const columns = [
    { title: '#', dataIndex: 'index', key: 'i', width: 50 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100, render: (t: ItemType) => <TypeTag type={t} /> },
    {
      title: '问题',
      dataIndex: 'question',
      key: 'q',
      ellipsis: true,
      render: (q: string) => <Typography.Text style={{ maxWidth: 360 }}>{q}</Typography.Text>,
    },
    {
      title: '三维得分',
      key: 'scores',
      width: 220,
      render: (_: unknown, it: RunItem) =>
        it.scores ? (
          <span className="mono" style={{ fontSize: 12 }}>
            <span style={{ color: scoreTone(it.scores.recall) }}>{score(it.scores.recall)}</span>
            {' / '}
            <span style={{ color: scoreTone(it.scores.accuracy) }}>{score(it.scores.accuracy)}</span>
            {' / '}
            <span style={{ color: scoreTone(it.scores.citation) }}>{score(it.scores.citation)}</span>
          </span>
        ) : (
          <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
            {it.type === 'inject' ? `defended: ${it.defended === null ? '—' : String(it.defended)}` : `hallucinated: ${it.hallucinated === null ? '—' : String(it.hallucinated)}`}
          </span>
        ),
    },
    { title: '判定', dataIndex: 'passed', key: 'passed', width: 80, render: (p: boolean) => <PassTag passed={p} /> },
    { title: '耗时', dataIndex: 'latency_ms', key: 'lat', width: 80, render: (v: number | null) => (v === null ? '—' : `${v} ms`) },
    {
      title: '',
      key: 'act',
      width: 70,
      render: (_: unknown, it: RunItem) => (
        <Button type="link" size="small" onClick={() => setDrawerIndex(it.index)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        size="small"
        title={
          <span className="mono" style={{ fontSize: 13 }}>{runId}</span>
        }
        extra={
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void meta.reload()} />
            <Button size="small" onClick={() => navigate(`/compare?a=${runId}`)}>
              去对比
            </Button>
          </Space>
        }
      >
        {run && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions
              size="small"
              column={4}
              items={[
                { key: 't', label: '被测对象', children: run.target.label },
                { key: 'status', label: '状态', children: run.status },
                { key: 'time', label: '开始时间', children: fmtTime(run.created_at) },
                { key: 'dur', label: '耗时', children: fmtDuration(run.duration_ms) },
                { key: 'ds', label: '数据集', children: `${run.dataset.size} 条 · sha1 ${run.dataset.sha1 ? run.dataset.sha1.slice(0, 10) : '—'}` },
                { key: 'pass', label: '通过', children: `${run.summary.overall.passed}/${run.summary.overall.total}（${pct(run.summary.overall.pass_rate)}）` },
                { key: 'sec', label: '安全拦截率', children: pct(run.summary.security.block_rate) },
                { key: 'model', label: '模型', children: run.target.model ?? '—' },
              ]}
            />
            {run.note && <Typography.Text type="secondary">备注：{run.note}</Typography.Text>}
            {run.error && <Alert type="warning" showIcon message={run.error} />}
            {isRunning && liveStatus && (
              <RunProgress info={liveStatus} onCancel={onCancel} cancelling={cancelling} />
            )}
            {run.partial && (
              <Alert
                type="info"
                showIcon
                message="本次运行为部分结果（取消/中断），统计仅覆盖已完成用例"
              />
            )}
          </Space>
        )}
      </Card>

      {summaryCharts && (
        <Row gutter={16}>
          <Col span={5}>
            <Card size="small" title="总通过率" className="section-card">
              <EChart option={summaryCharts.gauge} height={220} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" title="分类型通过 / 失败" className="section-card">
              <EChart option={summaryCharts.stack} height={220} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" title="三维指标" className="section-card">
              <EChart option={summaryCharts.radar} height={220} />
            </Card>
          </Col>
          <Col span={7}>
            <Card size="small" title="分数分布（normal 用例）" className="section-card">
              <EChart option={histogramOption(allItems.data ?? [])} height={220} />
            </Card>
          </Col>
        </Row>
      )}

      <Card size="small" title="用例明细" className="section-card">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Segmented
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as ItemType | 'all')}
              options={[
                { value: 'all', label: '全部' },
                { value: 'normal', label: '功能问答' },
                { value: 'inject', label: '注入/越狱' },
                { value: 'hallucination', label: '幻觉探针' },
              ]}
            />
            <Select
              style={{ width: 130 }}
              value={passFilter}
              onChange={setPassFilter}
              options={[
                { value: 'all', label: '全部判定' },
                { value: 'passed', label: '仅通过' },
                { value: 'failed', label: '仅失败' },
              ]}
            />
            <Input.Search
              allowClear
              placeholder="搜索问题关键词"
              style={{ width: 260 }}
              onSearch={setQuery}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {items.data ? `共 ${items.data.total} 条` : ''}
            </Typography.Text>
          </Space>
          <Table
            rowKey="index"
            size="small"
            loading={items.loading || meta.loading}
            columns={columns}
            dataSource={items.data?.items ?? []}
            pagination={{
              current: page,
              pageSize: 20,
              total: items.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            onRow={(it) => ({ onClick: () => setDrawerIndex(it.index), style: { cursor: 'pointer' } })}
            rowClassName={(it) => (it.passed ? '' : 'breach-row')}
          />
        </Space>
      </Card>

      <ItemDrawer runId={runId} index={drawerIndex} onClose={() => setDrawerIndex(null)} />
    </Space>
  )
}
