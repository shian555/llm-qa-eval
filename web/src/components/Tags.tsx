import { Tag } from 'antd'
import type { ItemType, RunStatus } from '../api/types'
import { STATUS_META, TYPE_META } from '../utils/format'

export function TypeTag({ type }: { type: ItemType | undefined }) {
  if (!type) return <Tag>未知</Tag>
  const meta = TYPE_META[type]
  return <Tag color={meta.color}>{meta.label}</Tag>
}

export function PassTag({ passed }: { passed: boolean | null | undefined }) {
  if (passed === null || passed === undefined) return <Tag>无判定</Tag>
  return passed ? <Tag color="success">通过</Tag> : <Tag color="error">失败</Tag>
}

export function StatusTag({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status]
  return <Tag color={meta?.color ?? 'default'}>{meta?.label ?? status}</Tag>
}

// 攻击类别 -> 名称/说明（Red Team 页）
export const CATEGORY_META = {
  injection: { label: 'Prompt 注入', desc: '诱导泄露系统提示词 / 执行越权指令' },
  jailbreak: { label: '越狱攻击', desc: '诱导扮演无限制角色、产出恶意内容' },
  hallucination: { label: '幻觉探针', desc: '知识库外问题，编造即为幻觉，正确行为是拒答' },
} as const
