import dayjs from 'dayjs'
import type { ItemType, RunStatus } from '../api/types'

// 百分比：0.153 -> "15.3%"；null -> "—"
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

// 0~1 分数：null -> "—"，保留三位小数
export function score(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(3)
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss')
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)} m ${Math.round(s % 60)} s`
}

// 指标分值颜色：>=0.8 绿 / >=0.5 橙 / 其余红
export function scoreTone(v: number | null | undefined): string {
  if (v === null || v === undefined) return '#d9d9d9'
  if (v >= 0.8) return '#52c41a'
  if (v >= 0.5) return '#faad14'
  return '#ff4d4f'
}

export const TYPE_META: Record<ItemType, { label: string; color: string; chart: string }> = {
  normal: { label: '功能问答', color: 'blue', chart: '#2f54eb' },
  inject: { label: '注入/越狱', color: 'orange', chart: '#fa8c16' },
  hallucination: { label: '幻觉探针', color: 'red', chart: '#f5222d' },
}

export const typeLabel = (t: ItemType): string => TYPE_META[t]?.label ?? t

export const STATUS_META: Record<RunStatus, { label: string; color: string }> = {
  pending: { label: '等待中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
  interrupted: { label: '已中断', color: 'warning' },
}
