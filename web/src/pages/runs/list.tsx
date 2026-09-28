import { useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import { PlusOutlined, SwapOutlined } from '@ant-design/icons'
import { App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { createRun, deleteRun, listRuns } from '../../api'
import type { RunMeta } from '../../api/types'
import { KpiCard } from '../../components/KpiCard'
import { StatusTag } from '../../components/Tags'
import { TargetRadio } from '../../components/TargetRadio'
import { useAsync } from '../../hooks/useAsync'
import { fmtDuration, fmtTime, pct, scoreTone } from '../../utils/format'

function NewRunModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [targetId, setTargetId] = useState('mock')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      const { run_id } = await createRun({ target_id: targetId, note: note || undefined })
      message.success('评测已启动')
      onClose()
      navigate(`/runs/${run_id}`)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="发起新评测"
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText="启动评测"
      confirmLoading={submitting}
      width={560}
    >
      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 12 }}>
        <div>
          <Typography.Text strong>被测对象</Typography.Text>
          <div style={{ marginTop: 8 }}>
            <TargetRadio value={targetId} onChange={setTargetId} />
          </div>
        </div>
        <Form layout="vertical">
          <Form.Item label="备注（可选）" style={{ marginBottom: 0 }}>
            <Input
              placeholder="例如：接入真实 LLM 首次回归"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          评测将对数据集全量 100 条用例执行；mock/weak 目标秒级完成，real 目标约 2~5 分钟（可随时取消）。
        </Typography.Text>
      </Space>
    </Modal>
  )
}

export default function RunListPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [status, setStatus] = useState<string | undefined>()
  const [target, setTarget] = useState<string | undefined>()
  const [modalOpen, setModalOpen] = useState(false)
  const { data, loading, reload } = useAsync(
    () => listRuns({ status, target, page: 1, page_size: 50 }),
    [status, target],
  )

  const onDelete = async (runId: string) => {
    try {
      await deleteRun(runId)
      message.success('已删除')
      void reload()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns = [
    {
      title: '运行 ID',
      dataIndex: 'run_id',
      key: 'run_id',
      className: 'mono',
      width: 210,
      render: (v: string) => <Typography.Text onClick={() => navigate(`/runs/${v}`)} style={{ cursor: 'pointer' }}>{v}</Typography.Text>,
    },
    { title: '被测对象', key: 'target', width: 210, render: (_: unknown, r: RunMeta) => r.target.label },
    { title: '状态', key: 'status', width: 90, render: (_: unknown, r: RunMeta) => <StatusTag status={r.status} /> },
    {
      title: '通过率',
      key: 'pass',
      width: 170,
      render: (_: unknown, r: RunMeta) => {
        const v = r.summary.overall.pass_rate
        return (
          <Space>
            <Progress percent={v === null ? 0 : +(v * 100).toFixed(1)} size="small" strokeColor={scoreTone(v)} style={{ width: 90, marginBottom: 0 }} />
            <span style={{ fontSize: 12 }}>{pct(v)}</span>
          </Space>
        )
      },
    },
    {
      title: '安全拦截',
      key: 'sec',
      width: 90,
      render: (_: unknown, r: RunMeta) => pct(r.summary.security.block_rate),
    },
    { title: '用例数', key: 'total', width: 70, render: (_: unknown, r: RunMeta) => r.summary.overall.total },
    { title: '耗时', key: 'dur', width: 90, render: (_: unknown, r: RunMeta) => fmtDuration(r.duration_ms) },
    { title: '时间', key: 'time', width: 150, render: (_: unknown, r: RunMeta) => fmtTime(r.created_at) },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true },
    {
      title: '操作',
      key: 'act',
      width: 170,
      render: (_: unknown, r: RunMeta) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => navigate(`/runs/${r.run_id}`)}>
            详情
          </Button>
          {r.status === 'completed' && (
            <Button
              type="link"
              size="small"
              icon={<SwapOutlined />}
              onClick={() => navigate(`/compare?a=${r.run_id}`)}
            >
              对比
            </Button>
          )}
          <Popconfirm title="确认删除该运行记录？" onConfirm={() => onDelete(r.run_id)}>
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const runs = data?.items ?? []
  const completed = runs.filter((r) => r.status === 'completed')

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <StatsRow stats={completed} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Select
            allowClear
            placeholder="状态筛选"
            style={{ width: 140 }}
            value={status}
            onChange={setStatus}
            options={[
              { value: 'completed', label: '已完成' },
              { value: 'running', label: '运行中' },
              { value: 'failed', label: '失败' },
              { value: 'cancelled', label: '已取消' },
              { value: 'interrupted', label: '已中断' },
            ]}
          />
          <Select
            allowClear
            placeholder="目标筛选"
            style={{ width: 200 }}
            value={target}
            onChange={setTarget}
            options={[
              { value: 'mock', label: 'MockQATarget' },
              { value: 'weak', label: 'WeakQATarget' },
              { value: 'rag', label: '自建 RAG' },
              { value: 'real', label: '真实 LLM' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          发起新评测
        </Button>
      </div>

      {data?.running_id && (
        <Alert
          type="warning"
          showIcon
          message={
            <span>
              评测正在运行（<span className="mono">{data.running_id}</span>），
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/runs/${data.running_id}`)}>
                查看进度
              </Button>
            </span>
          }
        />
      )}

      <Table
        rowKey="run_id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={runs}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <NewRunModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Space>
  )
}

// 顶部统计条（简单复用 KpiCard）
function StatsRow({ stats }: { stats: RunMeta[] }) {
  const total = stats.length
  const avgPass = total
    ? stats.reduce((acc, r) => acc + (r.summary.overall.pass_rate ?? 0), 0) / total
    : null
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 200 }}>
        <KpiCard title="累计运行" value={total} />
      </div>
      <div style={{ width: 200 }}>
        <KpiCard
          title="平均通过率"
          value={avgPass === null ? '—' : +(avgPass * 100).toFixed(1)}
          suffix="%"
        />
      </div>
    </div>
  )
}
