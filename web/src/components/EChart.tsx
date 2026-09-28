import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

// 统一图表封装：notMerge 保证数据更新时不残留旧系列
export function EChart({ option, height = 280 }: { option: EChartsOption; height?: number }) {
  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
