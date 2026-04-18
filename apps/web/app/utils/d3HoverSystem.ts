import type { Ref } from 'vue'
import type { D3State } from './d3SvgSkeleton'
import type { DailyRow } from '~/utils/d3Helpers'
import { pointer as d3Pointer } from 'd3-selection'
import { BRUSH_GAP, BRUSH_HEIGHT, MARGIN } from './d3ChartTypes'

export function createHoverSystem(
  d3State: D3State,
  props: { data: DailyRow[], width: number, height: number },
  series: Ref<any[]>,
  dataLookup: Ref<Map<string, Map<string, DailyRow>>>,
  dailyTotals: Ref<Map<string, number>>,
  emit: (event: 'hover', e: PointerEvent, payload: any | null) => void,
) {
  function handleHover(event: PointerEvent, d: any) {
    event.preventDefault()
    if (!d3State.xScale || !d3State.svgSelection || !d3State.yScale)
      return
    const contributor = d.key as string
    const [px, py] = d3Pointer(event, d3State.svgSelection.node())
    const date = d3State.xScale.invert(px)
    const isoDate = date.toISOString().split('T')[0]
    const chartHeight = props.height - MARGIN.top - MARGIN.bottom - BRUSH_HEIGHT - BRUSH_GAP

    // Crosshair lines
    if (d3State.crosshairGroup) {
      d3State.crosshairGroup.select('.crosshair-h')
        .style('display', 'block')
        .attr('x1', MARGIN.left)
        .attr('x2', props.width - MARGIN.right)
        .attr('y1', py)
        .attr('y2', py)
      d3State.crosshairGroup.select('.crosshair-v')
        .style('display', 'block')
        .attr('x1', px)
        .attr('x2', px)
        .attr('y1', MARGIN.top)
        .attr('y2', MARGIN.top + chartHeight)
    }

    // Highlight hovered layer path
    if (d3State.hoverHighlightEl && d3State.areaGenerator) {
      const layer = series.value.find(s => s.key === contributor)
      if (layer) {
        d3State.hoverHighlightEl
          .datum(layer)
          .attr('d', d3State.areaGenerator)
          .style('opacity', 0.85)
      }
    }

    const lookup = dataLookup.value
    const dateMap = lookup.get(contributor)
    if (!dateMap || dateMap.size === 0)
      return

    // O(1) exact match first, then nearest-date fallback
    let row = dateMap.get(isoDate) ?? null
    if (!row) {
      const targetTime = date.getTime()
      let minDelta = Infinity
      let nearest: DailyRow | null = null
      for (const r of dateMap.values()) {
        const delta = Math.abs(new Date(r.date).getTime() - targetTime)
        if (delta < minDelta) {
          minDelta = delta
          nearest = r
        }
      }
      // Accept nearest within ~31 days (covers month granularity)
      if (nearest && minDelta <= 31 * 86400000)
        row = nearest
    }

    if (row) {
      const totalDay = dailyTotals.value.get(row.date) || 0
      const percentage = totalDay > 0 ? Math.round(row.commits / totalDay * 100) : 0
      emit('hover', event, {
        contributor: row.contributor,
        date: row.date,
        commits: row.commits,
        linesAdded: row.linesAdded,
        linesDeleted: row.linesDeleted,
        filesTouched: row.filesTouched,
        percentage,
        totalCommits: totalDay,
      })
    }
    else {
      // Still show tooltip with date + contributor, even without data point
      emit('hover', event, {
        contributor,
        date: isoDate,
        commits: 0,
        linesAdded: 0,
        linesDeleted: 0,
        filesTouched: 0,
        percentage: 0,
      })
    }
  }

  function handleLeave(event: PointerEvent) {
    // Hide crosshair
    if (d3State.crosshairGroup) {
      d3State.crosshairGroup.select('.crosshair-h').style('display', 'none')
      d3State.crosshairGroup.select('.crosshair-v').style('display', 'none')
    }
    // Hide highlight
    if (d3State.hoverHighlightEl) {
      d3State.hoverHighlightEl.style('opacity', 0)
    }
    emit('hover', event, null)
  }

  return { handleHover, handleLeave }
}
