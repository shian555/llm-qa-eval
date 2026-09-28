import { Card, Statistic } from 'antd'
import type { ReactNode } from 'react'

interface Props {
  title: string
  value?: string | number
  precision?: number
  suffix?: string
  sub?: ReactNode
  loading?: boolean
  valueStyle?: React.CSSProperties
}

// KPI 卡片：主数值 + 副说明（Dashboard / 对比页通用）
export function KpiCard({ title, value, precision, suffix, sub, loading, valueStyle }: Props) {
  return (
    <Card size="small" loading={loading} styles={{ body: { padding: '12px 16px' } }}>
      <Statistic
        title={title}
        value={value}
        precision={precision}
        suffix={suffix}
        valueStyle={valueStyle}
      />
      {sub !== undefined && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{sub}</div>
      )}
    </Card>
  )
}
