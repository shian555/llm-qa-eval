import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Typography,
} from 'antd'
import { ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { compareRuns } from '../../api'
import type { DeltaPack, DiffResult, ItemType } from '../../api/types'
import { EChart } from '../../components/EChart'
import { ItemDrawer } from '../../components/ItemDrawer'
import { PassTag, TypeTag } from '../../components/Tags'
import { RunSelect } from '../../components/RunSelect'
import { fmtTime, pct } from '../../utils/format'

function DeltaArrow({ pack, invert = false }: { pack: DeltaPack; invert?: boolean }) {
  if (pack.delta === null || pack.a === null || pack.b === null) return <span>—</span>
  const good = invert ? pack.delta < 0 : pack.delta > 0
  const flat = pack.delta === 0
  const color = flat ? 'rgba(0,0,0,0.45)' : good ? '#52c41a' : '#ff4d4f'
  const Icon = flat ? ArrowRightOutlined : pack.delta > 0 ? ArrowUpOutlined : ArrowDownOutlined
  return (
    <span style={{ color, fontSize: 13 }}>
      <Icon /> {(pack.delta * 100).toFixed(1)}pp
    </span>
  )
}

function DeltaStat({
  title,
  pack,
  invert = false,
  asPercent = true,
}: {
  title: string
  pack: DeltaPack | undefined
  invert?: boolean
  asPercent?: boolean
}) {
  if (!pack) return null
  const fmt = (v: number | null) =>
    v === null ? '—' : asPercent ? pct(v) : v.toFixed(3)
  return (
    <Card size="small" className="section-card">
      <Statistic
        title={title}
        value={fmt(pack.b)}
        suffix={asPercent && pack.b !== null ? '' : undefined}
        valueStyle={{ color: pack.delta === null ? undefined : pack.delta === 0 ? undefined : (invert ? pack.delta < 0 : pack.delta > 0) ? '#52c41a' : '#ff4d4f' }}
      />
      <Space size={8} style={{ marginTop: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          A {fmt(pack.a)} →
        </Typography.Text>
        <DeltaArrow pack={pack} invert={invert} />
      </Space>
    </Card>
  )
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const [runA, setRunA] = useState<string | undefined>(params.get('a') ?? undefined)
  const [runB, setRunB] = useState<string | undefined>(undefined)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [drawer, setDrawer] = useState<{ runId: string; index: number } | null>(null)

  useEffect(() => {
    if (runA) setParams({ a: runA }, { replace: true })
    else setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runA])

  const canCompare = Boolean(runA && runB && runA !== runB)

  useEffect(() => {
    if (!canCompare) {
      setDiff(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    compareRuns(runA!, runB!)
      .then((d) => {
        if (alive) setDiff(d)
      })
      .catch((e) => {
        if (alive) setError((e as Error).message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [runA, runB, canCompare])

  const radarOption: EChartsOption | null = useMemo(() => {
    if (!diff) return null
    return {
      tooltip: {},
      legend: { bottom: 0 },
      radar: { indicator: diff.radar.indicators, radius: '62%' },
      series: [
        {
          type: 'radar',
          data: [
            { value: diff.radar.a, name: `A ${diff.a.run_id.slice(0, 18)}`, areaStyle: { color: 'rgba(47,84,235,0.2)' }, itemStyle: { color: '#2f54eb' } },
            { value: diff.radar.b, name: `B ${diff.b.run_id.slice(0, 18)}`, areaStyle: { color: 'rgba(82,196,26,0.2)' }, itemStyle: { color: '#52c41a' } },
          ],
        },
      ],
    }
  }, [diff])

  const byTypeOption: EChartsOption | null = useMemo(() => {
    if (!diff) return null
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 48, right: 24, top: 24, bottom: 56 },
      xAxis: { type: 'category', data: diff.by_type.map((t) => t.label) },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series: [
        {
          name: 'A（基线）',
          type: 'bar',
          barGap: 0,
          color: '#2f54eb',
          data: diff.by_type.map((t) => (t.pass_rate.a === null ? 0 : +(t.pass_rate.a * 100).toFixed(1))),
        },
        {
          name: 'B（本次）',
          type: 'bar',
          color: '#52c41a',
          data: diff.by_type.map((t) => (t.pass_rate.b === null ? 0 : +(t.pass_rate.b * 100).toFixed(1))),
        },
      ],
    }
  }, [diff])

  const detailColumns = (tab: 'all' | 'reg' | 'imp') => [
    { title: '#', dataIndex: 'index', key: 'i', width: 50 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100, render: (t: ItemType) => <TypeTag type={t} /> },
    { title: '问题', dataIndex: 'question', key: 'q', ellipsis: true },
    {
      title: 'A 判定',
      key: 'a',
      width: 90,
      render: (_: unknown, r: DiffResult['item_diff']['details'][number]) => <PassTag passed={r.a.passed} />,
    },
    { title: '', key: 'arrow', width: 40, render: () => <ArrowRightOutlined style={{ color: 'rgba(0,0,0,0.35)' }} /> },
    {
      title: 'B 判定',
      key: 'b',
      width: 90,
      render: (_: unknown, r: DiffResult['item_diff']['details'][number]) => <PassTag passed={r.b.passed} />,
    },
    {
      title: '变化',
      key: 'delta',
      width: 100,
      render: (_: unknown, r: DiffResult['item_diff']['details'][number]) => {
        const changed = r.a.passed !== r.b.passed
        const regressed = r.a.passed && !r.b.passed
        return changed ? (
          <span style={{ color: regressed ? '#ff4d4f' : '#52c41a', fontSize: 12 }}>
            {regressed ? '▼ 退化' : '▲ 改善'}
          </span>
        ) : (
          <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 12 }}>— 无变化</span>
        )
      },
    },
    {
      title: '操作',
      key: 'act',
      width: 130,
      render: (_: unknown, r: DiffResult['item_diff']['details'][number]) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDrawer({ runId: runA!, index: r.index })}>
            A 详情
          </Button>
          <Button type="link" size="small" onClick={() => setDrawer({ runId: runB!, index: r.index })}>
            B 详情
          </Button>
        </Space>
      ),
    },
  ]

  const filterDetails = (tab: 'all' | 'reg' | 'imp') =>
    (diff?.item_diff.details ?? []).filter((d) =>
      tab === 'all' ? true : tab === 'reg' ? d.a.passed && !d.b.passed : !d.a.passed && d.b.passed,
    )

  const tabItems = (['all', 'reg', 'imp'] as const).map((tab) => {
    const count = tab === 'all' ? diff?.item_diff.details.length ?? 0 : tab === 'reg' ? diff?.item_diff.regressions ?? 0 : diff?.item_diff.improvements ?? 0
    const label = tab === 'all' ? '全部用例' : tab === 'reg' ? '退化用例' : '改善用例'
    return {
      key: tab,
      label: `${label}（${count}）`,
      children: (
        <Table
          rowKey="index"
          size="small"
          columns={detailColumns(tab)}
          dataSource={filterDetails(tab)}
          pagination={tab === 'all' ? { pageSize: 20, showSizeChanger: false } : false}
          rowClassName={(d: DiffResult['item_diff']['details'][number]) =>
            d.a.passed !== d.b.passed ? (d.a.passed ? 'breach-row' : 'improve-row') : ''
          }
        />
      ),
    }
  })

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" className="section-card">
        <Space wrap size={24}>
          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
              A（基线）
            </Typography.Text>
            <RunSelect value={runA} onChange={setRunA} style={{ width: 340 }} />
          </div>
          <ArrowRightOutlined style={{ fontSize: 20, color: 'rgba(0,0,0,0.35)', marginTop: 22 }} />
          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
              B（本次）
            </Typography.Text>
            <RunSelect value={runB} onChange={setRunB} style={{ width: 340 }} />
          </div>
          {runA && runA === runB && (
            <Typography.Text type="danger" style={{ marginTop: 26 }}>
              A 与 B 不能选择同一个运行
            </Typography.Text>
          )}
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 12, fontSize: 12 }}>
          选择两次已完成的运行进行对比：支持不同被测对象（mock vs weak）或同目标跨时间回归。指标变化以百分点（pp）展示，绿升红降；安全类指标（ASR）下降为改善。
        </Typography.Paragraph>
      </Card>

      {error && <Alert type="error" showIcon message="对比失败" description={error} />}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin tip="正在对比两次运行…" />
        </div>
      )}

      {!canCompare && !error && (
        <Card className="section-card">
          <Empty description="请选择 A、B 两个运行以开始对比" style={{ padding: 48 }} />
        </Card>
      )}

      {diff && !loading && (
        <>
          <Row gutter={16}>
            <Col span={4}>
              <DeltaStat title="总通过率" pack={diff.overall.pass_rate} />
            </Col>
            <Col span={4}>
              <DeltaStat title="检索召回率" pack={diff.overall.recall} asPercent={false} />
            </Col>
            <Col span={4}>
              <DeltaStat title="问答准确率" pack={diff.overall.accuracy} asPercent={false} />
            </Col>
            <Col span={4}>
              <DeltaStat title="引用准确性" pack={diff.overall.citation} asPercent={false} />
            </Col>
            <Col span={4}>
              <DeltaStat title="安全拦截率" pack={diff.overall.block_rate} />
            </Col>
            <Col span={4}>
              <DeltaStat title="攻击成功率 ASR" pack={diff.overall.asr} invert />
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={10}>
              <Card size="small" title="三维指标雷达（A vs B）" className="section-card">
                <EChart option={radarOption!} height={300} />
              </Card>
            </Col>
            <Col span={14}>
              <Card size="small" title="分类型通过率对比" className="section-card">
                <EChart option={byTypeOption!} height={300} />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            title="用例级差异"
            className="section-card"
            extra={
              <Space size={16}>
                <span style={{ fontSize: 12, color: '#ff4d4f' }}>▼ 退化 {diff.item_diff.regressions}</span>
                <span style={{ fontSize: 12, color: '#52c41a' }}>▲ 改善 {diff.item_diff.improvements}</span>
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  无变化 通过 {diff.item_diff.unchanged_pass} / 失败 {diff.item_diff.unchanged_fail}
                </span>
              </Space>
            }
          >
            <Tabs defaultActiveKey="all" items={tabItems} />
          </Card>

          <Card size="small" className="section-card" title="运行信息">
            <Space direction="vertical" size={4}>
              <Typography.Text style={{ fontSize: 13 }}>
                A：<span className="mono">{diff.a.run_id}</span> · {diff.a.label} · {fmtTime(diff.a.created_at)}
              </Typography.Text>
              <Typography.Text style={{ fontSize: 13 }}>
                B：<span className="mono">{diff.b.run_id}</span> · {diff.b.label} · {fmtTime(diff.b.created_at)}
              </Typography.Text>
            </Space>
          </Card>
        </>
      )}

      <ItemDrawer
        runId={drawer?.runId ?? ''}
        index={drawer?.index ?? null}
        onClose={() => setDrawer(null)}
      />
    </Space>
  )
}
