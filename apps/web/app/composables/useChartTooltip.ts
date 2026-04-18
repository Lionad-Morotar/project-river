import type { Ref } from 'vue'
import { readonly, ref } from 'vue'

export interface TooltipData {
  visible: boolean
  x: number
  y: number
  contributor: string
  date: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  percentage: number
  totalCommits: number
}

export interface HoverPayload {
  contributor: string
  date: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  percentage: number
  totalCommits?: number
}

const TIP_W = 180
const TIP_H = 120
const OFFSET = 16
const MARGIN = 8

export function useChartTooltip(containerRef: Ref<HTMLElement | null>) {
  const tooltip = ref<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    contributor: '',
    date: '',
    commits: 0,
    linesAdded: 0,
    linesDeleted: 0,
    filesTouched: 0,
    percentage: 0,
    totalCommits: 0,
  })

  function updateTooltip(event: PointerEvent, payload: HoverPayload | null) {
    if (!payload || !containerRef.value) {
      tooltip.value.visible = false
      return
    }

    const rect = containerRef.value.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const finalX = x + TIP_W + OFFSET > rect.width ? x - TIP_W - MARGIN : x + OFFSET
    const finalY = y + TIP_H + OFFSET > rect.height ? y - TIP_H - MARGIN : y + OFFSET

    tooltip.value = {
      visible: true,
      x: finalX,
      y: finalY,
      contributor: payload.contributor,
      date: payload.date,
      commits: payload.commits,
      linesAdded: payload.linesAdded,
      linesDeleted: payload.linesDeleted,
      filesTouched: payload.filesTouched,
      percentage: payload.percentage,
      totalCommits: payload.totalCommits ?? 0,
    }
  }

  function hideTooltip() {
    tooltip.value.visible = false
  }

  return {
    tooltip: readonly(tooltip),
    updateTooltip,
    hideTooltip,
  }
}
