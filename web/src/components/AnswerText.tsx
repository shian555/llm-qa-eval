import type { ReactNode } from 'react'

// 把答案里的 [n] 引文标记渲染成高亮角标
export function renderCitations(text: string | null | undefined): ReactNode {
  if (!text) return <span style={{ color: 'rgba(0,0,0,0.45)' }}>（无答案）</span>
  const parts = text.split(/(\[\d+\])/g)
  return parts.map((p, i) =>
    /^\[\d+\]$/.test(p) ? (
      <span className="cite-mark mono" key={i}>
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}
