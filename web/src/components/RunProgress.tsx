import { Alert, Button, Progress, Space, Typography } from 'antd'
import type { RunStatusInfo } from '../api/types'
import { fmtDuration } from '../utils/format'

interface Props {
  info: RunStatusInfo
  onCancel: () => void
  cancelling?: boolean
}

// 运行进行中的进度区：百分比 + 当前正在评测的用例 + 协作式取消
export function RunProgress({ info, onCancel, cancelling }: Props) {
  const { done, total } = info.progress
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Progress
          percent={percent}
          status="active"
          style={{ flex: 1, marginBottom: 0 }}
        />
        <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
          {done}/{total} · 已运行 {fmtDuration(info.elapsed_ms)}
        </Typography.Text>
        <Button danger size="small" loading={cancelling} onClick={onCancel}>
          取消
        </Button>
      </div>
      {info.current_question && (
        <Typography.Text type="secondary" ellipsis style={{ maxWidth: '100%' }}>
          正在评测：{info.current_question}
        </Typography.Text>
      )}
      {info.error && <Alert type="error" showIcon message={info.error} />}
    </Space>
  )
}
