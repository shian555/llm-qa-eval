import { Select } from 'antd'
import { useAsync } from '../hooks/useAsync'
import { listRuns } from '../api'
import dayjs from 'dayjs'

interface Props {
  value?: string | null
  onChange: (v: string) => void
  style?: React.CSSProperties
  placeholder?: string
}

// 已完成运行选择器（对比页 / 安全页共用）：时间 + 目标 + 通过率
export function RunSelect({ value, onChange, style, placeholder }: Props) {
  const { data } = useAsync(
    () => listRuns({ status: 'completed', page: 1, page_size: 100 }),
    [],
  )
  const options = (data?.items ?? []).map((m) => ({
    value: m.run_id,
    label: `${dayjs(m.created_at).format('MM-DD HH:mm')} · ${m.target.label} · 通过率 ${(
      (m.summary.overall.pass_rate ?? 0) * 100
    ).toFixed(0)}%`,
  }))
  return (
    <Select
      showSearch
      optionFilterProp="label"
      value={value ?? undefined}
      onChange={onChange}
      options={options}
      loading={!data}
      style={{ minWidth: 320, ...style }}
      placeholder={placeholder ?? '选择一次已完成的评测运行'}
    />
  )
}
