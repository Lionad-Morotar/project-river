export interface ChartColors {
  axisColor: string
  tickColor: string
  gridColor: string
  highlightColor: string
  brushBg: string
  brushStroke: string
  textStroke: string
  crosshair: string
  hoverStroke: string
  brushFill: string
  brushHandle: string
  fallback: string
}

export function useChartTheme() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')

  const colors = computed<ChartColors>(() => isDark.value
    ? {
        axisColor: '#94a3b8',
        tickColor: '#94a3b8',
        gridColor: '#334155',
        highlightColor: 'rgba(56,189,248,0.15)',
        brushBg: '#0f172a',
        brushStroke: '#475569',
        textStroke: '#0f172a',
        crosshair: '#64748b',
        hoverStroke: '#ffffff',
        brushFill: 'rgba(59,130,246,0.1)',
        brushHandle: '#94a3b8',
        fallback: '#999',
      }
    : {
        axisColor: '#64748b',
        tickColor: '#64748b',
        gridColor: '#e2e8f0',
        highlightColor: 'rgba(56,189,248,0.12)',
        brushBg: '#f1f5f9',
        brushStroke: '#cbd5e1',
        textStroke: '#ffffff',
        crosshair: '#94a3b8',
        hoverStroke: '#0f172a',
        brushFill: 'rgba(59,130,246,0.08)',
        brushHandle: '#64748b',
        fallback: '#999',
      })

  return { isDark, colors }
}
