// 与后端 schema 对齐的类型定义

export type ItemType = 'normal' | 'inject' | 'hallucination'
export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export interface Scores {
  recall: number
  accuracy: number
  citation: number
}

export interface RunItem {
  index: number
  type: ItemType
  question: string
  contexts: string[] | null
  answer: string | null
  scores: Scores | null
  defended: boolean | null
  hallucinated: boolean | null
  passed: boolean
  error: string | null
  latency_ms: number | null
}

export interface TypeStat {
  total: number
  passed: number
  pass_rate: number | null
  avg_recall?: number | null
  avg_accuracy?: number | null
  avg_citation?: number | null
  attack_total?: number
  breached?: number
  asr?: number | null
  hallucinated?: number
  hallucination_rate?: number | null
}

export interface RunSummary {
  overall: { total: number; passed: number; pass_rate: number | null }
  by_type: Record<string, TypeStat>
  dims: { recall: number | null; accuracy: number | null; citation: number | null }
  security: {
    attack_total: number
    breached: number
    block_rate: number | null
    asr: number | null
  }
}

export interface RunMeta {
  run_id: string
  status: RunStatus
  target: { id: string; label: string; model: string | null }
  dataset: { path: string; size: number; sha1: string | null }
  note: string | null
  created_at: string
  finished_at: string | null
  duration_ms: number | null
  partial: boolean
  error: string | null
  progress: { done: number; total: number }
  summary: RunSummary
}

export interface RunStatusInfo {
  run_id: string
  status: RunStatus
  progress: { done: number; total: number }
  current_question: string | null
  elapsed_ms: number | null
  error: string | null
}

export interface TargetInfo {
  id: string
  label: string
  description: string
  requires_env: string[]
  available: boolean
}

export interface DeltaPack<T = number | null> {
  a: T
  b: T
  delta: T
}

export interface DiffResult {
  a: { run_id: string; label: string; created_at: string; summary: RunSummary }
  b: { run_id: string; label: string; created_at: string; summary: RunSummary }
  overall: Record<string, DeltaPack>
  by_type: Array<{
    type: ItemType
    label: string
    total: { a: number; b: number }
    pass_rate: DeltaPack
    avg_recall?: DeltaPack
    avg_accuracy?: DeltaPack
    avg_citation?: DeltaPack
    asr?: DeltaPack
    hallucination_rate?: DeltaPack
  }>
  radar: { indicators: Array<{ name: string; max: number }>; a: number[]; b: number[] }
  item_diff: {
    regressions: number
    improvements: number
    unchanged_pass: number
    unchanged_fail: number
    details: Array<{
      index: number
      type: ItemType
      question: string
      a: { passed: boolean; scores: Scores | null; defended: boolean | null; hallucinated: boolean | null }
      b: { passed: boolean; scores: Scores | null; defended: boolean | null; hallucinated: boolean | null }
    }>
  }
}

export interface Overview {
  kpis: {
    dataset_size: number
    type_distribution: Record<ItemType, number>
    latest_run: RunMeta | null
    overall_pass_rate: number | null
    avg_recall: number | null
    avg_accuracy: number | null
    avg_citation: number | null
    attack_total: number | null
    attack_blocked: number | null
    security_block_rate: number | null
  }
  radar: { indicators: Array<{ name: string; max: number }>; value: number[] }
  trend: Array<{
    run_id: string
    created_at: string
    label: string
    overall_pass_rate: number | null
    security_block_rate: number | null
    recall: number | null
  }>
  type_pass: Array<{ type: ItemType; label: string; pass_rate: number | null }>
  recent_runs: RunMeta[]
}

export interface DatasetItem {
  index: number
  type: ItemType
  question: string
  answer?: string
  keywords?: string[]
  docs?: string[]
}

export interface DatasetResp {
  total: number
  all_total: number
  stats: Record<ItemType, number>
  modified: boolean
  items: DatasetItem[]
}

export interface SecurityView {
  run_id: string | null
  target: RunMeta['target'] | null
  attack_total: number
  breached: number
  asr: number | null
  block_rate: number | null
  groups: Array<{
    category: 'injection' | 'jailbreak' | 'hallucination'
    label: string
    total: number
    breached: number
    asr: number
    items: Array<{
      index: number
      type: ItemType
      question: string
      answer: string | null
      defended: boolean | null
      hallucinated: boolean | null
      passed: boolean
      error: string | null
    }>
  }>
}

export interface PlaygroundResult {
  target_id: string
  question: string
  contexts: string[] | null
  answer: string | null
  latency_ms: number | null
  metrics: {
    gold_found: boolean
    note: string | null
    recall: number | null
    accuracy: number | null
    citation: number | null
  } | null
  security: { defended: boolean; hallucinated: boolean } | null
  error: string | null
}

export interface KbInfo {
  topics: Array<{ keyword: string; question: string }>
  attacks: Record<'injection' | 'jailbreak' | 'hallucination', string[]>
}
