import { Alert, Button, Card, Col, Empty, Progress, Row, Space, Table, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { EChart } from '../../components/EChart'
import { KpiCard } from '../../components/KpiCard'
import { StatusTag } from '../../components/Tags'
import { useAsync } from '../../hooks/useAsync'
import { getOverview } from '../../api'
import type { RunMeta } from '../../api/types'
import { fmtDuration, fmtTime, pct, scoreTone, TYPE_META } from '../../utils/format'

const RADAR_COLORS = ['#2f54eb', '#52c41a', '#fa8c16', '#f5222d']

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data, loading } = useAsync(getOverview, [])
  const kpis = data?.kpis
  const hasRun = (data?.trend.length ?? 0) > 0

  // 三维指标雷达
  const radarOption: EChartsOption = {
    radar: {
      indicator: data?.radar.indicators ?? [],
      radius: '65%',
      splitNumber: 4,
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: data?.radar.value ?? [],
            name: '三维指标',
            areaStyle: { color: 'rgba(47,84,235,0.25)' },
            itemStyle: { color: '#2f54eb' },
          },
        ],
      },
    ],
  }

  // 用例类型分布（环形）
  const dist = kpis?.type_distribution
  const distOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        label: { formatter: '{b}: {c}' },
        data: Object.entries(dist ?? {}).map(([t, n]) => ({
          name: TYPE_META[t as keyof typeof TYPE_META]?.label ?? t,
          value: n,
          itemStyle: { color: TYPE_META[t as keyof typeof TYPE_META]?.chart },
        })),
      },
    ],
  }

  // 历史运行趋势（通过率 + 安全拦截率）
  const trendOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 24, top: 24, bottom: 56 },
    xAxis: {
      type: 'category',
      data: (data?.trend ?? []).map((t, i) => `#${i + 1}`),
    },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '总通过率',
        type: 'line',
        smooth: true,
        data: (data?.trend ?? []).map((t) =>
          t.overall_pass_rate === null ? null : +(t.overall_pass_rate * 100).toFixed(1),
        ),
        color: '#2f54eb',
      },
      {
        name: '安全拦截率',
        type: 'line',
        smooth: true,
        data: (data?.trend ?? []).map((t) =>
          t.security_block_rate === null ? null : +(t.security_block_rate * 100).toFixed(1),
        ),
        color: '#52c41a',
      },
    ],
  }

  // 分类型通过率
  const typePassOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      data: (data?.type_pass ?? []).map((t) => t.label),
    },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: [
      {
        type: 'bar',
        barWidth: 40,
        label: { show: true, position: 'top', formatter: ({ value }) => `${value}%` },
        data: (data?.type_pass ?? []).map((t) => ({
          value: t.pass_rate === null ? 0 : +(t.pass_rate * 100).toFixed(1),
          itemStyle: { color: TYPE_META[t.type].chart },
        })),
      },
    ],
  }

  const columns = [
    { title: '运行 ID', dataIndex: 'run_id', key: 'run_id', className: 'mono', width: 220 },
    {
      title: '被测对象',
      key: 'target',
      render: (_: unknown, r: RunMeta) => r.target.label,
      width: 220,
    },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: RunMeta['status']) => <StatusTag status={s} />, width: 90 },
    {
      title: '通过率',
      key: 'pass',
      width: 180,
      render: (_: unknown, r: RunMeta) => {
        const v = r.summary.overall.pass_rate
        return (
          <Space>
            <Progress
              percent={v === null ? 0 : +(v * 100).toFixed(1)}
              size="small"
              strokeColor={scoreTone(v)}
              style={{ width: 100, marginBottom: 0 }}
            />
            <span style={{ fontSize: 12 }}>{pct(v)}</span>
          </Space>
        )
      },
    },
    {
      title: '用例数',
      key: 'total',
      width: 80,
      render: (_: unknown, r: RunMeta) => r.summary.overall.total,
    },
    { title: '耗时', key: 'dur', width: 90, render: (_: unknown, r: RunMeta) => fmtDuration(r.duration_ms) },
    { title: '时间', key: 'time', width: 160, render: (_: unknown, r: RunMeta) => fmtTime(r.created_at) },
    {
      title: '',
      key: 'go',
      width: 60,
      render: (_: unknown, r: RunMeta) => (
        <Button type="link" size="small" icon={<ArrowRightOutlined />} onClick={() => navigate(`/runs/${r.run_id}`)} />
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col span={4}>
          <KpiCard
            title="评测集规模"
            value={kpis?.dataset_size ?? '—'}
            sub={dist ? `问答 ${dist.normal} · 注入/越狱 ${dist.inject} · 幻觉 ${dist.hallucination}` : ''}
            loading={loading}
          />
        </Col>
        <Col span={4}>
          <KpiCard
            title="总通过率"
            value={kpis?.overall_pass_rate === null || kpis?.overall_pass_rate === undefined ? '—' : +(kpis.overall_pass_rate * 100).toFixed(1)}
            suffix="%"
            loading={loading}
            valueStyle={{ color: scoreTone(kpis?.overall_pass_rate) }}
          />
        </Col>
        <Col span={4}>
          <KpiCard
            title="检索召回率"
            value={kpis?.avg_recall === null || kpis?.avg_recall === undefined ? '—' : kpis.avg_recall.toFixed(3)}
            sub="gold 片段命中 top-8"
            loading={loading}
          />
        </Col>
        <Col span={4}>
          <KpiCard
            title="问答准确率"
            value={kpis?.avg_accuracy === null || kpis?.avg_accuracy === undefined ? '—' : kpis.avg_accuracy.toFixed(3)}
            sub="关键词命中率"
            loading={loading}
          />
        </Col>
        <Col span={4}>
          <KpiCard
            title="引用准确性"
            value={kpis?.avg_citation === null || kpis?.avg_citation === undefined ? '—' : kpis.avg_citation.toFixed(3)}
            sub="引文编号有效性"
            loading={loading}
          />
        </Col>
        <Col span={4}>
          <KpiCard
            title="安全拦截率"
            value={kpis?.security_block_rate === null || kpis?.security_block_rate === undefined ? '—' : +(kpis.security_block_rate * 100).toFixed(1)}
            suffix="%"
            sub={kpis?.attack_total ? `拦截 ${kpis.attack_blocked}/${kpis.attack_total} 次攻击` : ''}
            loading={loading}
            valueStyle={{ color: scoreTone(kpis?.security_block_rate) }}
          />
        </Col>
      </Row>

      {!hasRun && !loading && (
        <Alert
          type="info"
          showIcon
          message="还没有评测运行"
          description="先发起一次评测，Dashboard 会展示通过率、三维指标与安全拦截的完整视图。"
          action={
            <Button type="primary" size="small" onClick={() => navigate('/runs')}>
              去发起评测
            </Button>
          }
        />
      )}

      <Row gutter={16}>
        <Col span={7}>
          <Card size="small" title="三维指标雷达" className="section-card">
            <EChart option={radarOption} height={260} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" title="用例类型分布" className="section-card">
            <EChart option={distOption} height={260} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" title="历史运行趋势" className="section-card">
            {hasRun ? (
              <EChart option={trendOption} height={260} />
            ) : (
              <Empty description="暂无运行历史" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 60 }} />
            )}
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" title="分类型通过率" className="section-card">
            <EChart option={typePassOption} height={260} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={
          <Space>
            <span>最近运行</span>
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              以最近一次已完成运行为当前快照
            </Typography.Text>
          </Space>
        }
        className="section-card"
      >
        <Table
          rowKey="run_id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={data?.recent_runs ?? []}
          pagination={false}
          onRow={(r) => ({ onClick: () => navigate(`/runs/${r.run_id}`), style: { cursor: 'pointer' } })}
        />
      </Card>
    </Space>
  )
}
