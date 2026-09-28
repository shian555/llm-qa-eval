import { Alert, Radio, Space, Tag, Typography } from 'antd'
import { useAsync } from '../hooks/useAsync'
import { getTargets } from '../api'
import type { TargetInfo } from '../api/types'

interface Props {
  value?: string
  onChange: (v: string) => void
}

// 被测对象卡片单选（发起新评测 / Playground 共用）
// real 目标缺环境变量时置灰并提示；weak 目标带"演示用"警示
export function TargetRadio({ value, onChange }: Props) {
  const { data: targets } = useAsync(getTargets, [])

  const renderCard = (t: TargetInfo) => (
    <Radio.Button
      key={t.id}
      value={t.id}
      disabled={!t.available}
      style={{ display: 'block', height: 'auto', padding: '10px 14px', whiteSpace: 'normal' }}
    >
      <Space direction="vertical" size={2}>
        <Space>
          <Typography.Text strong>{t.label}</Typography.Text>
          {t.id === 'weak' && <Tag color="orange">演示用</Tag>}
          {!t.available && <Tag>不可用</Tag>}
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'normal' }}>
          {t.description}
        </Typography.Text>
        {!t.available && (
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            需要环境变量：{t.requires_env.join(' / ')}
          </Typography.Text>
        )}
      </Space>
    </Radio.Button>
  )

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Radio.Group
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}
      >
        {(targets ?? []).map(renderCard)}
      </Radio.Group>
      {value === 'weak' && (
        <Alert
          type="info"
          showIcon
          message="WeakQATarget 的缺陷是设计出来的，仅用于演示评测系统能否抓住失败（低召回 / 被注入攻破 / 幻觉），不代表真实系统。"
        />
      )}
    </Space>
  )
}
