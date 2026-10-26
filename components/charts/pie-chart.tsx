'use client'

import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useMemo, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { getMutedChartColor, withAlpha } from '@/lib/colors'

interface PieChartProps {
  data: { name: string; value: number; color?: string }[]
  onSliceClick?: (name: string) => void
  height?: number
  showLegend?: boolean
  unit?: string
}

export function PieChart({ data, onSliceClick, height = 300, showLegend = true, unit = 'PLN' }: PieChartProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const parent = container?.parentElement
    if (!parent) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) chartRef.current?.getEchartsInstance()?.resize({ width })
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const chartTheme = useMemo(
    () => ({
      tooltipBackground: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
      tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.24)',
      tooltipText: isDark ? '#e2e8f0' : '#0f172a',
      segmentBorder: isDark ? '#0f172a' : '#ffffff',
      emphasisText: isDark ? '#f8fafc' : '#0f172a',
    }),
    [isDark]
  )

  const legendItems = useMemo(
    () =>
      data.map(item => {
        const baseColor = getMutedChartColor(item.color ?? '#3b82f6', isDark)
        return {
          name: item.name,
          color: withAlpha(baseColor, isDark ? 0.84 : 1),
        }
      }),
    [data, isDark]
  )

  const option: EChartsOption = useMemo(
    () => ({
      animationDuration: 250,
      tooltip: {
        trigger: 'item',
        backgroundColor: chartTheme.tooltipBackground,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: chartTheme.tooltipText,
        },
        formatter: `{b}: {c} ${unit} ({d}%)`,
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: chartTheme.segmentBorder,
            borderWidth: isDark ? 1 : 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            scale: true,
            scaleSize: isDark ? 4 : 6,
            label: {
              show: true,
              color: chartTheme.emphasisText,
              fontSize: 14,
              fontWeight: 'bold',
            },
            itemStyle: {
              shadowBlur: 10,
              shadowColor: isDark ? 'rgba(15, 23, 42, 0.25)' : 'rgba(15, 23, 42, 0.12)',
            },
          },
          labelLine: {
            show: false,
          },
          data: data.map(item => {
            const baseColor = getMutedChartColor(item.color ?? '#3b82f6', isDark)
            return {
              name: item.name,
              value: Math.round(item.value * 100) / 100,
              itemStyle: {
                color: withAlpha(baseColor, isDark ? 0.84 : 1),
              },
            }
          }),
        },
      ],
    }),
    [chartTheme, data, isDark, unit]
  )

  const handleClick = (params: { name?: string }) => {
    if (onSliceClick && params.name) {
      onSliceClick(params.name)
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3 min-w-0">
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height, width: '100%' }}
        onEvents={{ click: handleClick }}
        opts={{ renderer: 'svg' }}
      />
      {showLegend && legendItems.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2">
          {legendItems.map(item => (
            <button
              key={item.name}
              type="button"
              onClick={() => onSliceClick?.(item.name)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
