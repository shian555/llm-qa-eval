import { useEffect, useRef, useState } from 'react'

// 轮询 hook：stopWhen 返回 true 时自动停止（运行状态轮询、全局运行徽标）
export function usePolling<T>(
  fn: () => Promise<T>,
  opts: { intervalMs?: number; stopWhen?: (d: T) => boolean; deps?: unknown[] } = {},
) {
  const { intervalMs = 1000, stopWhen, deps = [] } = opts
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const stoppedRef = useRef(false)
  const fnRef = useRef(fn)
  const stopRef = useRef(stopWhen)
  fnRef.current = fn
  stopRef.current = stopWhen

  useEffect(() => {
    stoppedRef.current = false
    let timer: number | undefined

    const tick = async () => {
      try {
        const d = await fnRef.current()
        if (stoppedRef.current) return
        setData(d)
        if (stopRef.current?.(d)) return // 终态：停止轮询
      } catch {
        // 轮询失败不打断页面，下个周期重试
      }
      if (!stoppedRef.current) timer = window.setTimeout(tick, intervalMs)
    }

    setLoading(true)
    void tick()
    return () => {
      stoppedRef.current = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading }
}
