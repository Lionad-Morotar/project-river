<script setup lang="ts">
import type { EventSeverity } from '~/composables/useProjectEvents'
import type { D3AreaGenerator, D3BrushXBehavior, D3ScaleLinear, D3ScaleUtc, D3ZoomBehavior } from '~/utils/d3ChartTypes'
import type { DailyRow } from '~/utils/d3Helpers'
import { useElementSize } from '@vueuse/core'
import { extent, max, min } from 'd3-array'
import { axisBottom, axisLeft } from 'd3-axis'
import { brushSelection, brushX as d3BrushX } from 'd3-brush'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { pointer as d3Pointer, select } from 'd3-selection'
import { curveBasis, area as d3Area } from 'd3-shape'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useChartTheme } from '~/composables/useChartTheme'
import { BRUSH_GAP, BRUSH_HEIGHT, HIT_AREA_PX, MARGIN, MAX_CONTRIBUTOR_LABELS, MAX_SPIKE_MARKERS, MIN_THICKNESS_PX } from '~/utils/d3ChartTypes'
import { buildStack, pivotDailyData } from '~/utils/d3Helpers'

interface MarkerItem {
  id: string
  date: string
  priority: number
  severity: EventSeverity
  selected?: boolean
}

interface Props {
  data: DailyRow[]
  selectedMonth: string | null
  colors: Map<string, string>
  monthNames?: string[]
  eventMarkers?: MarkerItem[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedMonth', value: string | null): void
  (e: 'rangeChange', range: { start: string, end: string } | null): void
  (e: 'hover', event: PointerEvent, payload: { contributor: string, date: string, commits: number, linesAdded: number, linesDeleted: number, filesTouched: number, percentage: number, totalCommits?: number } | null): void
  (e: 'markerHover', event: PointerEvent, marker: MarkerItem | null): void
}>()

const chartRef = ref<HTMLDivElement | null>(null)
const { width: svgWidth, height: svgHeight } = useElementSize(chartRef)

// -- Theme-aware colors (D3 cannot use Tailwind tokens) --
const { isDark, colors } = useChartTheme()

// Local aliases from centralized constants
const { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft } = MARGIN
const brushHeight = BRUSH_HEIGHT
const brushGap = BRUSH_GAP

const contributors = computed(() => {
  const set = new Set<string>()
  for (const row of props.data) {
    set.add(row.contributor)
  }
  return Array.from(set).sort()
})

const pivotedData = computed(() => {
  return pivotDailyData(props.data)
})

const series = computed(() => {
  return buildStack(contributors.value, pivotedData.value)
})

const yDomain = computed(() => {
  if (!series.value.length)
    return [0, 0] as [number, number]
  const yMin = min(series.value, layer => min(layer, d => d[0])) ?? 0
  const yMax = max(series.value, layer => max(layer, d => d[1])) ?? 0
  return [yMin, yMax] as [number, number]
})

/** O(1) hover lookup: contributor -> date -> row */
const dataLookup = computed(() => {
  const map = new Map<string, Map<string, DailyRow>>()
  for (const row of props.data) {
    let dateMap = map.get(row.contributor)
    if (!dateMap) {
      dateMap = new Map<string, DailyRow>()
      map.set(row.contributor, dateMap)
    }
    dateMap.set(row.date, row)
  }
  return map
})

/** O(1) daily total lookup for contribution percentage */
const dailyTotals = computed(() => {
  const map = new Map<string, number>()
  for (const row of props.data) {
    map.set(row.date, (map.get(row.date) || 0) + row.commits)
  }
  return map
})

/** Detect commit spike dates (> 2.5x mean daily total) for vertical markers */
const spikeDates = computed(() => {
  const totals = Array.from(dailyTotals.value.values())
  if (totals.length < 14)
    return []
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length
  if (mean === 0)
    return []
  const threshold = mean * 2.5
  const spikes: string[] = []
  for (const [date, total] of dailyTotals.value) {
    if (total > threshold)
      spikes.push(date)
  }
  return spikes
    .sort((a, b) => (dailyTotals.value.get(b) || 0) - (dailyTotals.value.get(a) || 0))
    .slice(0, MAX_SPIKE_MARKERS)
})

/** Find widest point per contributor for inline labels */
const contributorLabelData = computed(() => {
  if (!series.value.length)
    return []
  const labels: Array<{ contributor: string, dateIndex: number, maxThickness: number }> = []
  for (const layer of series.value) {
    let maxT = 0
    let bestI = 0
    for (let i = 0; i < layer.length; i++) {
      const t = layer[i][1] - layer[i][0]
      if (t > maxT) {
        maxT = t
        bestI = i
      }
    }
    if (maxT > 0)
      labels.push({ contributor: layer.key as string, dateIndex: bestI, maxThickness: maxT })
  }
  labels.sort((a, b) => b.maxThickness - a.maxThickness)
  return labels.slice(0, MAX_CONTRIBUTOR_LABELS)
})

// -- Module-level D3 state (persisted across updates) --

let svgNode: SVGSVGElement | null = null
let gXAxisEl: SVGGElement | null = null
let brushGroup: SVGGElement | null = null
let xBase: D3ScaleUtc | null = null
let xScale: D3ScaleLinear | null = null
let yScale: D3ScaleLinear | null = null
let zoomBehavior: D3ZoomBehavior | null = null
let brushBehavior: D3BrushXBehavior | null = null
let areaGenerator: D3AreaGenerator | null = null
let hitAreaGenerator: D3AreaGenerator | null = null
let monthHighlight: SVGRectElement | null = null
let isProgrammaticZoom = false
let isMonthDrivenZoom = false
let brushCleanupFallback: ((e: PointerEvent) => void) | null = null
let crosshairGroup: ReturnType<typeof select> | null = null
let hoverHighlightEl: ReturnType<typeof select> | null = null

// D3 selections that persist across updates
let svgSelection: ReturnType<typeof select> | null = null
let gChartSelection: ReturnType<typeof select> | null = null
let gBrushGroupSelection: ReturnType<typeof select> | null = null
let gYAxisGridSelection: ReturnType<typeof select> | null = null
let gYAxisLabelsSelection: ReturnType<typeof select> | null = null
let gXAxisSelection: ReturnType<typeof select> | null = null
let clipRectSelection: ReturnType<typeof select> | null = null
let gAnnotationsSelection: ReturnType<typeof select> | null = null
let gEventMarkersSelection: ReturnType<typeof select> | null = null
let gLabelsSelection: ReturnType<typeof select> | null = null

// Trackpad gesture state
let gestureStartScale = 1
let isGestureActive = false
let wheelCleanup: (() => void) | null = null
let gestureCleanup: (() => void) | null = null

// Interaction state — suppress hover & throttle range emission during pan/zoom
const isInteracting = ref(false)
let interactionTimer: ReturnType<typeof setTimeout> | null = null
let rangeRafId: number | null = null

function markInteracting() {
  isInteracting.value = true
  // Hide crosshair & highlight immediately
  if (crosshairGroup) {
    crosshairGroup.select('.crosshair-h').style('display', 'none')
    crosshairGroup.select('.crosshair-v').style('display', 'none')
  }
  if (hoverHighlightEl)
    hoverHighlightEl.style('opacity', 0)

  if (interactionTimer)
    clearTimeout(interactionTimer)
  interactionTimer = setTimeout(() => {
    isInteracting.value = false
  }, 120)
}

const defaultMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthNames = computed(() => props.monthNames ?? defaultMonths)

/** Smart time format adapting to visible time span */
function smartTimeFormat(date: Date): string {
  if (!xScale)
    return ''
  const domain = xScale.domain()
  const span = (domain[1] as number) - (domain[0] as number)
  const oneYear = 365.25 * 86400000
  const months = monthNames.value

  if (span > 5 * oneYear)
    return date.getMonth() === 0 ? `${date.getFullYear()}` : ''
  if (span > oneYear)
    return date.getMonth() === 0 ? `${date.getFullYear()}` : months[date.getMonth()]!
  if (span > 90 * 86400000)
    return `${months[date.getMonth()]} ${date.getFullYear()}`
  return `${months[date.getMonth()]} ${date.getDate()}`
}

/** Emit current visible date range to parent (RAF-throttled) */
function emitVisibleRange() {
  if (!xScale || !xBase)
    return
  if (rangeRafId)
    cancelAnimationFrame(rangeRafId)
  rangeRafId = requestAnimationFrame(() => {
    rangeRafId = null
    const [d0, d1] = xScale!.domain()
    const start = new Date(d0 as number).toISOString().split('T')[0]!
    const end = new Date(d1 as number).toISOString().split('T')[0]!
    emit('rangeChange', { start, end })
  })
}

// -- Hover handlers (extracted so they can be reused in data-join) --

function handleHover(event: PointerEvent, d: any) {
  event.preventDefault()
  if (isInteracting.value)
    return
  if (!xScale || !svgSelection || !yScale)
    return
  const contributor = d.key as string
  const [px, py] = d3Pointer(event, svgSelection.node())
  const date = xScale.invert(px)
  const isoDate = date.toISOString().split('T')[0]!
  const chartHeight = svgHeight.value - marginTop - marginBottom - brushHeight - brushGap

  // Skip hover if band has negligible height at this position (0-commit segment)
  const targetTime = date.getTime()
  let bandHeight = 0
  let minDt = Infinity
  for (let i = 0; i < d.length; i++) {
    const pt = d[i]!
    const dt = Math.abs(pt.data.date.getTime() - targetTime)
    if (dt < minDt) {
      minDt = dt
      bandHeight = pt[1] - pt[0]
    }
  }
  if (bandHeight < 0.5)
    return

  // Crosshair lines
  if (crosshairGroup) {
    crosshairGroup.select('.crosshair-h')
      .style('display', 'block')
      .attr('x1', marginLeft)
      .attr('x2', svgWidth.value - marginRight)
      .attr('y1', py)
      .attr('y2', py)
    crosshairGroup.select('.crosshair-v')
      .style('display', 'block')
      .attr('x1', px)
      .attr('x2', px)
      .attr('y1', marginTop)
      .attr('y2', marginTop + chartHeight)
  }

  // Highlight hovered layer path
  if (hoverHighlightEl && areaGenerator) {
    // Find the series for this contributor
    const layer = series.value.find(s => s.key === contributor)
    if (layer) {
      hoverHighlightEl
        .datum(layer)
        .attr('d', areaGenerator)
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
  if (crosshairGroup) {
    crosshairGroup.select('.crosshair-h').style('display', 'none')
    crosshairGroup.select('.crosshair-v').style('display', 'none')
  }
  // Hide highlight
  if (hoverHighlightEl) {
    hoverHighlightEl.style('opacity', 0)
  }
  emit('hover', event, null)
}

// -- SVG skeleton: only runs once per mount / resize --

function initSvg() {
  if (!chartRef.value || !svgWidth.value || !svgHeight.value)
    return

  // Preserve current zoom transform before clearing (resize re-render)
  let savedTransform: any = null
  if (svgNode) {
    const existingZoom = (svgNode as any).__zoom
    if (existingZoom && typeof existingZoom.k === 'number' && typeof existingZoom.x === 'number') {
      savedTransform = zoomIdentity.translate(existingZoom.x, existingZoom.y || 0).scale(existingZoom.k)
    }
  }

  const container = select(chartRef.value)
  container.selectAll('*').remove()

  // Render at device pixel ratio for crisp paths at high zoom
  const dpr = window.devicePixelRatio || 1
  const cssW = svgWidth.value
  const cssH = svgHeight.value

  const svg = container
    .append('svg')
    .attr('width', cssW * dpr)
    .attr('height', cssH * dpr)
    .attr('viewBox', `0 0 ${cssW} ${cssH}`)
    .attr('style', `max-width: 100%; width: ${cssW}px; height: ${cssH}px; display: block; user-select: none; -webkit-user-select: none;`)
    .attr('shape-rendering', 'geometricPrecision')

  svgNode = svg.node() as SVGSVGElement
  svgSelection = svg

  const chartWidth = svgWidth.value - marginLeft - marginRight
  const chartHeight = svgHeight.value - marginTop - marginBottom - brushHeight - brushGap

  // defs / clipPath
  const clipRect = svg.append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', marginLeft)
    .attr('y', 0)
    .attr('width', chartWidth)
    .attr('height', marginTop + chartHeight)
  clipRectSelection = clipRect

  // Chart group (clipped)
  gChartSelection = svg.append('g')
    .attr('clip-path', 'url(#clip)')

  // Dark background for chart area (transparent, for pointer events)
  gChartSelection.append('rect')
    .attr('class', 'chart-bg')
    .attr('x', marginLeft)
    .attr('y', marginTop)
    .attr('width', chartWidth)
    .attr('height', chartHeight)
    .attr('fill', 'transparent')

  // Grid lines container
  gChartSelection.append('g').attr('class', 'grid-lines')

  // Month highlight overlay
  const highlightSel = gChartSelection.append('rect')
    .attr('class', 'month-highlight')
    .attr('fill', colors.value.highlightColor)
    .attr('y', marginTop)
    .attr('height', chartHeight)
    .style('display', 'none')
    .style('pointer-events', 'none')
  monthHighlight = highlightSel.node() as SVGRectElement

  // Layers container (paths will be added via data-join)
  // Reveal clip: rect scales from 0→1 width, CSS-animated
  svg.select('defs')
    .append('clipPath')
    .attr('id', 'layers-reveal')
    .append('rect')
    .attr('class', 'reveal-clip-rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', svgWidth.value)
    .attr('height', svgHeight.value)
  gChartSelection.append('g')
    .attr('class', 'layers')
    .attr('clip-path', 'url(#layers-reveal)')

  // Annotations container (vertical spike markers)
  gAnnotationsSelection = gChartSelection.append('g').attr('class', 'annotations')

  // Event markers container (project events from key-events panel)
  gEventMarkersSelection = gChartSelection.append('g').attr('class', 'event-markers')

  // Inline labels container (contributor names at widest points)
  gLabelsSelection = gChartSelection.append('g').attr('class', 'labels')

  // Crosshair lines (X + Y guide lines following cursor)
  const crosshair = gChartSelection.append('g').attr('class', 'crosshair')
  crosshair.append('line')
    .attr('class', 'crosshair-h')
    .attr('stroke', colors.value.crosshair)
    .attr('stroke-width', 0.5)
    .attr('stroke-dasharray', '4,3')
    .style('display', 'none')
    .style('pointer-events', 'none')
  crosshair.append('line')
    .attr('class', 'crosshair-v')
    .attr('stroke', colors.value.crosshair)
    .attr('stroke-width', 0.5)
    .attr('stroke-dasharray', '4,3')
    .style('display', 'none')
    .style('pointer-events', 'none')

  crosshairGroup = gChartSelection.select('.crosshair')

  gChartSelection.append('path')
    .attr('class', 'hover-highlight')
    .attr('fill', 'none')
    .attr('stroke', colors.value.hoverStroke)
    .attr('stroke-width', 2)
    .style('pointer-events', 'none')
    .style('opacity', 0)
  hoverHighlightEl = gChartSelection.select('.hover-highlight')

  // X-axis group
  gXAxisSelection = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${marginTop + chartHeight})`)
  gXAxisEl = gXAxisSelection.node() as SVGGElement

  // Y-axis grid (tick lines across chart)
  gYAxisGridSelection = svg.append('g')
    .attr('class', 'y-axis-grid')
    .attr('transform', `translate(${marginLeft},${marginTop})`)

  // Y-axis labels
  gYAxisLabelsSelection = svg.append('g')
    .attr('class', 'y-axis-labels')
    .attr('transform', `translate(${marginLeft},${marginTop})`)

  // Brush group
  gBrushGroupSelection = svg.append('g')
    .attr('class', 'brush-group')
    .attr('transform', `translate(0, ${svgHeight.value - brushHeight})`)

  // Brush background rect
  gBrushGroupSelection.append('rect')
    .attr('class', 'brush-bg')
    .attr('x', marginLeft)
    .attr('width', chartWidth)
    .attr('height', brushHeight)
    .attr('fill', colors.value.brushBg)
    .attr('rx', 4)

  // Brush mini layers container
  gBrushGroupSelection.append('g').attr('class', 'brush-layers')

  // Separator line between chart and brush
  gBrushGroupSelection.append('line')
    .attr('class', 'brush-separator')
    .attr('x1', marginLeft)
    .attr('x2', marginLeft + chartWidth)
    .attr('y1', -brushGap / 2)
    .attr('y2', -brushGap / 2)
    .attr('stroke', colors.value.gridColor)
    .attr('stroke-width', 1)

  // Setup zoom behavior
  zoomBehavior = d3Zoom()
    .scaleExtent([1, 50])
    .extent([[marginLeft, 0], [svgWidth.value - marginRight, marginTop + chartHeight]])
    .translateExtent([[marginLeft, -Infinity], [svgWidth.value - marginRight, Infinity]])
    .on('zoom', handleZoom)

  svg.call(zoomBehavior)

  // -- Custom wheel / trackpad gesture handling --
  // D3's built-in wheel.zoom is disabled in favor of native listeners so we
  // can distinguish vertical scrolling (page scroll, do not intercept) from
  // horizontal panning and pinch-to-zoom.
  setupWheelAndGestureListeners()

  // Restore zoom transform after resize re-render
  if (savedTransform && zoomBehavior) {
    svg.call(zoomBehavior.transform, savedTransform)
  }

  // Setup brush behavior
  brushBehavior = d3BrushX()
    .extent([[marginLeft, 0.5], [svgWidth.value - marginRight, brushHeight - 0.5]])
    .on('start end', handleBrushStartEnd)
    .on('brush end', handleBrushMove)

  const brushGroupSel = gBrushGroupSelection.append('g')
    .attr('class', 'brush')
    .call(brushBehavior)

  brushGroup = brushGroupSel.node() as SVGGElement

  // Style brush handles
  brushGroupSel.selectAll('.selection').attr('fill', colors.value.brushFill).attr('stroke', colors.value.brushStroke)
  brushGroupSel.selectAll('.handle').attr('fill', colors.value.brushHandle).attr('rx', 2)
}

// -- Zoom handler --

function handleZoom(event: any) {
  if (!xBase || !gXAxisEl || !gXAxisSelection || !areaGenerator)
    return
  if (event.sourceEvent?.type === 'brush')
    return
  markInteracting()

  const chartWidth = svgWidth.value - marginLeft - marginRight

  // Clamp transform so visible range stays within data domain [firstCommit, lastAnalysis]
  const [rMin, rMax] = xBase.range()
  const k = event.transform.k
  const rawX = event.transform.x
  // At scale k, the visible left in original coords = (rMin - t.x) / k
  // Must be ≥ rMin  →  t.x ≤ rMin * (1 - k)
  // Visible right = (rMax - t.x) / k must be ≤ rMax  →  t.x ≥ rMax * (1 - k)
  const clampedX = Math.max(rMax * (1 - k), Math.min(rMin * (1 - k), rawX))
  const t = k === 1 && rawX === 0 ? event.transform : zoomIdentity.translate(clampedX, 0).scale(k)

  // Sync D3 internal transform to clamped value to prevent state drift.
  // Without this, panning past a boundary accumulates offset in D3's __zoom,
  // making the user "undo" the phantom offset before the chart responds.
  if (rawX !== clampedX && svgSelection) {
    const node = svgSelection.node() as any
    if (node)
      node.__zoom = t
  }

  const newX = t.rescaleX(xBase)
  xScale!.domain(newX.domain())

  gXAxisSelection.call(axisBottom(xScale!).ticks(Math.max(2, Math.floor(chartWidth / 80))))
  gXAxisSelection.call(g => g.select('.domain').attr('stroke', colors.value.axisColor))
  gXAxisSelection.call(g => g.selectAll('.tick line').attr('stroke', colors.value.axisColor))
  gXAxisSelection.call(g => g.selectAll('.tick text').attr('fill', colors.value.tickColor).attr('font-size', '11px').style('paint-order', 'stroke').style('stroke', colors.value.textStroke).style('stroke-width', '3px').style('stroke-linejoin', 'round'))

  updateLayerPaths()
  updateMonthHighlight()

  if (brushGroup && brushBehavior && !isProgrammaticZoom) {
    isProgrammaticZoom = true
    // Clamp brush selection to data bounds
    const sel = rMax > rMin
      ? [Math.max(rMin, t.invertX(rMin)), Math.min(rMax, t.invertX(rMax))]
      : [rMin, rMax]
    select(brushGroup).call(brushBehavior.move, sel)
    isProgrammaticZoom = false
  }

  if (!isMonthDrivenZoom)
    emitVisibleRange()
}

// -- Brush handlers --

function handleBrushStartEnd(event: any) {
  if (event.type === 'start') {
    brushCleanupFallback = (_e: PointerEvent) => {
      const bg = brushGroup
      if (bg) {
        const pe = bg.getAttribute('pointer-events')
        if (pe === 'none') {
          select(window).on('mousemove.brush mouseup.brush', null)
          select(bg).attr('pointer-events', 'all')
          select(bg).selectAll('.overlay').attr('cursor', 'crosshair')
        }
      }
      if (brushCleanupFallback) {
        window.removeEventListener('pointerup', brushCleanupFallback, true)
        brushCleanupFallback = null
      }
    }
    window.addEventListener('pointerup', brushCleanupFallback, true)
  }
  else if (event.type === 'end' && brushCleanupFallback) {
    window.removeEventListener('pointerup', brushCleanupFallback, true)
    brushCleanupFallback = null
  }
}

function handleBrushMove(event: any) {
  if (!xBase || !zoomBehavior || !svgSelection)
    return
  if (!event.selection || event.sourceEvent?.type === 'zoom' || isProgrammaticZoom)
    return

  const [x0, x1] = event.selection.map(xBase.invert, xBase)
  const domainSpan = xBase.domain()[1].getTime() - xBase.domain()[0].getTime()
  const selectionSpan = x1.getTime() - x0.getTime()

  // Safety guards: avoid degenerate, inverted, or extreme selections
  if (!Number.isFinite(selectionSpan) || selectionSpan <= 0 || !Number.isFinite(domainSpan))
    return

  const k = Math.min(50, Math.max(1, domainSpan / selectionSpan))
  const tx = -xBase(x0) * k + marginLeft

  if (!Number.isFinite(k) || !Number.isFinite(tx))
    return

  isProgrammaticZoom = true
  svgSelection.call(zoomBehavior.transform, zoomIdentity.translate(tx, 0).scale(k))
  isProgrammaticZoom = false

  emitVisibleRange()
}

// -- Wheel & trackpad gesture handlers --

function setupWheelAndGestureListeners() {
  const container = chartRef.value
  if (!container)
    return

  // Remove any previous listeners first
  if (wheelCleanup) {
    wheelCleanup()
    wheelCleanup = null
  }
  if (gestureCleanup) {
    gestureCleanup()
    gestureCleanup = null
  }

  // Disable D3's built-in wheel.zoom so it doesn't intercept before our
  // custom handler.  Without this, D3 zooms on every wheel event (including
  // two-finger pan), making pan feel like pinch-to-zoom.
  svgSelection?.on('wheel.zoom', null)

  const onWheel = (event: WheelEvent) => {
    if (!zoomBehavior || !svgSelection || !svgNode || !xBase)
      return
    // During Safari pinch gesture, wheel events fire in parallel — skip them
    // so only the dampened gesture handler controls zoom sensitivity.
    if (isGestureActive)
      return

    const isHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    const isZoom = event.ctrlKey || event.metaKey

    if (isZoom) {
      // Ctrl / Cmd + scroll  →  zoom
      event.preventDefault()
      markInteracting()
      const t = (svgNode as any).__zoom || zoomIdentity
      const factor = event.deltaY > 0 ? 1.08 : 0.92
      const newK = Math.max(1, Math.min(50, t.k * factor))

      // Zoom centred on pointer X
      const rect = container.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const newT = zoomIdentity
        .translate(t.x + cx * (1 - newK / t.k), 0)
        .scale(newK)

      svgSelection.call(zoomBehavior.transform, newT)
    }
    else if (isHorizontal) {
      // Two-finger horizontal swipe  →  pan
      event.preventDefault()
      markInteracting()
      const t = (svgNode as any).__zoom || zoomIdentity
      // Dampen delta so panning feels natural
      const dx = -event.deltaX * 1.5
      const newT = zoomIdentity.translate(t.x + dx, 0).scale(t.k)
      svgSelection.call(zoomBehavior.transform, newT)
    }
    // Pure vertical scroll: do NOT intercept — let the page scroll normally
  }

  container.addEventListener('wheel', onWheel, { passive: false })
  wheelCleanup = () => container.removeEventListener('wheel', onWheel)

  // Safari pinch-to-zoom via gesture events
  const onGestureStart = (e: Event) => {
    isGestureActive = true
    gestureStartScale = (e as any).scale
  }
  const onGestureChange = (e: Event) => {
    e.preventDefault()
    if (!zoomBehavior || !svgSelection || !svgNode)
      return
    const ge = e as any
    // Ignore pure pan gestures: scale stays ~1.0 during two-finger drag
    if (Math.abs(ge.scale - gestureStartScale) < 0.02)
      return
    markInteracting()
    const t = (svgNode as any).__zoom || zoomIdentity
    // Dampen raw pinch ratio so small finger movements don't over-zoom
    const rawRatio = gestureStartScale / ge.scale
    const dampenedRatio = 1 + (rawRatio - 1) * 0.35
    const newK = Math.max(1, Math.min(50, t.k * dampenedRatio))
    gestureStartScale = ge.scale

    // Zoom centred on gesture centre (approximate with viewport centre)
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    const newT = zoomIdentity
      .translate(t.x + cx * (1 - newK / t.k), 0)
      .scale(newK)

    svgSelection.call(zoomBehavior.transform, newT)
  }

  const onGestureEnd = () => {
    isGestureActive = false
  }

  container.addEventListener('gesturestart', onGestureStart)
  container.addEventListener('gesturechange', onGestureChange)
  container.addEventListener('gestureend', onGestureEnd)
  gestureCleanup = () => {
    container.removeEventListener('gesturestart', onGestureStart)
    container.removeEventListener('gesturechange', onGestureChange)
    container.removeEventListener('gestureend', onGestureEnd)
  }
}

// -- Scale computation (called on init, resize, and data change) --

function updateScales() {
  if (!svgSelection || !svgWidth.value || !svgHeight.value)
    return

  const chartWidth = svgWidth.value - marginLeft - marginRight
  const chartHeight = svgHeight.value - marginTop - marginBottom - brushHeight - brushGap

  // Update clipPath dimensions
  if (clipRectSelection) {
    clipRectSelection
      .attr('width', chartWidth)
      .attr('height', marginTop + chartHeight)
  }

  // Update chart background rect dimensions
  if (gChartSelection) {
    gChartSelection.select('.chart-bg')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
  }

  // Compute base x-scale from data
  const dateExtent = extent(pivotedData.value, d => d.date) as [Date, Date]
  xBase = scaleUtc()
    .domain(dateExtent)
    .range([marginLeft, svgWidth.value - marginRight])

  // Preserve current zoom domain if we have a zoom transform
  const existingZoom = svgNode ? (svgNode as any).__zoom : null
  if (existingZoom && typeof existingZoom.k === 'number') {
    xScale = zoomIdentity
      .translate(existingZoom.x || 0, 0)
      .scale(existingZoom.k)
      .rescaleX(xBase) as D3ScaleLinear
  }
  else {
    xScale = xBase.copy() as D3ScaleLinear
  }

  yScale = scaleLinear()
    .domain(yDomain.value)
    .range([chartHeight, 0])

  // Area generator with minimum thickness clamping
  const currentXScale = xScale
  const currentYScale = yScale
  const clampedY1 = (d: any) => Math.min(currentYScale(d[1]), currentYScale(d[0]) - MIN_THICKNESS_PX)
  areaGenerator = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => currentXScale(d.data.date))
    .y0((d: any) => currentYScale(d[0]))
    .y1(clampedY1)

  // Hit area generator — expanded by HIT_AREA_PX on each side for easier hovering
  hitAreaGenerator = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => currentXScale(d.data.date))
    .y0((d: any) => currentYScale(d[0]) + HIT_AREA_PX)
    .y1((d: any) => clampedY1(d) - HIT_AREA_PX)

  // Update X-axis
  if (gXAxisSelection) {
    gXAxisSelection
      .attr('transform', `translate(0,${marginTop + chartHeight})`)
      .call(axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 80))).tickFormat(smartTimeFormat))
      .call(g => g.select('.domain').attr('stroke', colors.value.axisColor))
      .call(g => g.selectAll('.tick line').attr('stroke', colors.value.axisColor))
      .call(g => g.selectAll('.tick text').attr('fill', colors.value.tickColor).attr('font-size', '11px').style('paint-order', 'stroke').style('stroke', colors.value.textStroke).style('stroke-width', '3px').style('stroke-linejoin', 'round'))
  }

  // Update Y-axis grid
  if (gYAxisGridSelection) {
    gYAxisGridSelection
      .attr('transform', `translate(${marginLeft},${marginTop})`)
      .call(
        axisLeft(yScale)
          .ticks(5)
          .tickSize(-chartWidth)
          .tickFormat(() => ''),
      )
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', colors.value.gridColor).attr('stroke-width', 0.5))
  }

  // Update Y-axis labels
  if (gYAxisLabelsSelection) {
    gYAxisLabelsSelection
      .attr('transform', `translate(${marginLeft},${marginTop})`)
      .call(
        axisLeft(yScale)
          .ticks(5)
          .tickSize(0),
      )
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick text').attr('fill', colors.value.tickColor).attr('font-size', '11px').style('paint-order', 'stroke').style('stroke', colors.value.textStroke).style('stroke-width', '3px').style('stroke-linejoin', 'round'))
  }

  // Update brush group position and internal elements
  if (gBrushGroupSelection) {
    gBrushGroupSelection.attr('transform', `translate(0, ${svgHeight.value - brushHeight})`)

    gBrushGroupSelection.select('.brush-bg')
      .attr('width', chartWidth)

    gBrushGroupSelection.select('.brush-separator')
      .attr('x2', marginLeft + chartWidth)

    // Update brush extent
    if (brushBehavior) {
      brushBehavior.extent([[marginLeft, 0.5], [svgWidth.value - marginRight, brushHeight - 0.5]])
    }
  }

  // Update month highlight height
  if (monthHighlight) {
    select(monthHighlight).attr('height', chartHeight)
  }
}

// -- Layer paths via D3 data-join (called on data change) --

function updateLayers() {
  if (!gChartSelection || !gBrushGroupSelection || !areaGenerator || !xBase)
    return

  // Main chart layers — group-based data-join with hit area + visual path
  const layersContainer = gChartSelection.select('.layers')

  const groups = layersContainer.selectAll('g.layer-group')
    .data(series.value, (d: any) => d.key)
    .join(
      (enter) => {
        const g = enter.append('g').attr('class', 'layer-group')

        // Hit area path (behind, catches pointer events)
        g.append('path')
          .attr('class', 'layer-hitarea')
          .attr('fill', 'transparent')
          .style('pointer-events', 'all')
          .style('cursor', 'crosshair')
          .on('pointerenter pointermove', handleHover)
          .on('pointerleave', handleLeave)

        // Visual path (in front, no pointer events)
        g.append('path')
          .attr('class', 'layer-visual')
          .attr('fill', (d: any) => props.colors.get(d.key) || colors.value.fallback)
          .style('pointer-events', 'none')

        return g
      },
      update => update,
      exit => exit.remove(),
    )

  // select (not selectAll) propagates parent data to child
  groups.select('path.layer-visual')
    .attr('fill', (d: any) => props.colors.get(d.key) || colors.value.fallback)
    .attr('d', areaGenerator)

  if (hitAreaGenerator) {
    groups.select('path.layer-hitarea')
      .attr('d', hitAreaGenerator)
  }

  // Brush mini layers — data-join
  const yBrush = scaleLinear()
    .domain(yDomain.value)
    .range([brushHeight - 2, 2])

  const brushAreaGen = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => xBase!(d.data.date))
    .y0((d: any) => yBrush(d[0]))
    .y1((d: any) => yBrush(d[1]))

  const brushLayersContainer = gBrushGroupSelection.select('.brush-layers')

  brushLayersContainer.selectAll('path.brush-layer')
    .data(series.value, (d: any) => d.key)
    .join(
      enter => enter.append('path')
        .attr('class', 'brush-layer')
        .attr('fill', (d: any) => props.colors.get(d.key) || colors.value.fallback)
        .attr('opacity', 0.4),
      update => update
        .attr('fill', (d: any) => props.colors.get(d.key) || colors.value.fallback),
      exit => exit.remove(),
    )
    .attr('d', brushAreaGen)

  // Reset brush to full range if it's the first render
  if (brushGroup && brushBehavior) {
    const brushSel = select(brushGroup)
    const currentSelection = brushSelection(brushSel) as [number, number] | null
    // Only move brush to full range on initial setup (no existing selection)
    if (!currentSelection) {
      brushSel.call(brushBehavior.move, xBase.range())
    }
  }

  updateMonthHighlight()
  updateAnnotations()
  updateEventMarkers()
  updateLabels()
}

/** Update only the path `d` attributes (used by zoom handler for performance) */
function updateLayerPaths() {
  if (!gChartSelection || !areaGenerator)
    return
  gChartSelection.selectAll('path.layer-visual').attr('d', areaGenerator)
  if (hitAreaGenerator) {
    gChartSelection.selectAll('path.layer-hitarea').attr('d', hitAreaGenerator)
  }
  updateAnnotations()
  updateEventMarkers()
  updateLabels()
}

function updateMonthHighlight() {
  if (!monthHighlight || !props.selectedMonth || !xScale) {
    if (monthHighlight)
      select(monthHighlight).style('display', 'none')
    return
  }
  let start: Date
  let end: Date
  if (/^\d{4}$/.test(props.selectedMonth)) {
    const year = Number(props.selectedMonth)
    start = new Date(Date.UTC(year, 0, 1))
    end = new Date(Date.UTC(year + 1, 0, 1))
  }
  else {
    start = new Date(`${props.selectedMonth}-01T00:00:00Z`)
    end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
  }

  const x0 = xScale(start)
  const x1 = xScale(end)
  const cw = svgWidth.value - marginLeft - marginRight

  // clamp to visible chart area inside clip
  const visibleX0 = Math.max(marginLeft, Math.min(x0, marginLeft + cw))
  const visibleX1 = Math.max(marginLeft, Math.min(x1, marginLeft + cw))

  if (visibleX1 > visibleX0) {
    select(monthHighlight)
      .attr('x', visibleX0)
      .attr('width', visibleX1 - visibleX0)
      .style('display', 'block')
  }
  else {
    select(monthHighlight).style('display', 'none')
  }
}

/** Render vertical dashed lines at commit spike dates */
function updateAnnotations() {
  if (!gAnnotationsSelection || !xScale || !yScale)
    return
  const chartHeight = svgHeight.value - marginTop - marginBottom - brushHeight - brushGap

  const spikeData = spikeDates.value.map(date => ({
    date,
    x: xScale(new Date(date)),
  })).filter(d => Number.isFinite(d.x))

  gAnnotationsSelection.selectAll('line.spike')
    .data(spikeData, (d: any) => d.date)
    .join(
      enter => enter.append('line')
        .attr('class', 'spike')
        .attr('stroke', colors.value.tickColor)
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.4)
        .style('pointer-events', 'none'),
      update => update,
      exit => exit.remove(),
    )
    .attr('x1', (d: any) => d.x)
    .attr('x2', (d: any) => d.x)
    .attr('y1', marginTop)
    .attr('y2', marginTop + chartHeight)
}

/** Render vertical marker lines for project events */
function updateEventMarkers() {
  if (!gEventMarkersSelection || !xScale)
    return
  const chartHeight = svgHeight.value - marginTop - marginBottom - brushHeight - brushGap

  const markerData = (props.eventMarkers || [])
    .map(m => ({ ...m, x: xScale(new Date(m.date)) }))
    .filter(m => Number.isFinite(m.x))

  const severityStroke = (s: EventSeverity) => {
    switch (s) {
      case 'warning': return '#f59e0b'
      case 'positive': return '#34d399'
      case 'info': return '#38bdf8'
      default: return '#94a3b8'
    }
  }

  const severityDash = (s: EventSeverity) => {
    return s === 'info' ? '4,4' : 'none'
  }

  gEventMarkersSelection.selectAll('line.event-marker')
    .data(markerData, (d: any) => d.id)
    .join(
      enter => enter.append('line')
        .attr('class', 'event-marker')
        .attr('stroke', (d: any) => severityStroke(d.severity))
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', (d: any) => severityDash(d.severity))
        .attr('opacity', (d: any) => d.selected !== false ? 0.6 : 0)
        .style('cursor', 'pointer')
        .style('pointer-events', (d: any) => d.selected !== false ? 'stroke' : 'none'),
      update => update
        .attr('stroke', (d: any) => severityStroke(d.severity))
        .attr('stroke-dasharray', (d: any) => severityDash(d.severity))
        .attr('opacity', (d: any) => d.selected !== false ? 0.6 : 0)
        .style('pointer-events', (d: any) => d.selected !== false ? 'stroke' : 'none'),
      exit => exit.remove(),
    )
    .attr('x1', (d: any) => d.x)
    .attr('x2', (d: any) => d.x)
    .attr('y1', marginTop)
    .attr('y2', marginTop + chartHeight)
    .on('pointerenter pointermove', function (event: PointerEvent, d: any) {
      select(this).attr('stroke-width', 3).attr('opacity', 1)
      emit('markerHover', event, d as MarkerItem)
    })
    .on('pointerleave', function (event: PointerEvent, d: any) {
      select(this).attr('stroke-width', 1.5).attr('opacity', d.selected !== false ? 0.6 : 0)
      emit('markerHover', event, null)
    })
}

/** Render contributor name labels at the widest point of their streams */
function updateLabels() {
  if (!gLabelsSelection || !xScale || !yScale)
    return

  const labelData = contributorLabelData.value.map((l) => {
    const layer = series.value.find(s => s.key === l.contributor)
    if (!layer)
      return null
    const point = layer[l.dateIndex]
    if (!point)
      return null
    return {
      contributor: l.contributor,
      x: xScale(point.data.date),
      y: yScale((point[0] + point[1]) / 2),
    }
  }).filter((d): d is { contributor: string, x: number, y: number } => d !== null && Number.isFinite(d.x) && Number.isFinite(d.y))

  gLabelsSelection.selectAll('text.label')
    .data(labelData, (d: any) => d.contributor)
    .join(
      enter => enter.append('text')
        .attr('class', 'label')
        .attr('fill', (d: any) => props.colors.get(d.contributor) || colors.value.fallback)
        .attr('font-size', '10px')
        .attr('font-weight', 500)
        .attr('opacity', 0.85)
        .style('pointer-events', 'none')
        .style('paint-order', 'stroke')
        .style('stroke', colors.value.textStroke)
        .style('stroke-width', '3px')
        .style('stroke-linejoin', 'round')
        .text((d: any) => d.contributor),
      update => update,
      exit => exit.remove(),
    )
    .attr('x', (d: any) => d.x + 4)
    .attr('y', (d: any) => d.y + 3)
}

function zoomToMonth(month: string | null) {
  if (!zoomBehavior || !xBase || !svgSelection)
    return

  isMonthDrivenZoom = true

  try {
    if (!month) {
      svgSelection.call(zoomBehavior.transform, zoomIdentity)
      return
    }

    const domain = xBase.domain()
    let start: Date
    let end: Date

    if (/^\d{4}$/.test(month)) {
      const year = Number(month)
      start = new Date(Date.UTC(year, 0, 1))
      end = new Date(Date.UTC(year + 1, 0, 1))
    }
    else {
      start = new Date(`${month}-01T00:00:00Z`)
      end = new Date(start)
      end.setUTCMonth(end.getUTCMonth() + 1)
    }

    if (start < domain[0])
      start = domain[0]
    if (end > domain[1])
      end = domain[1]
    if (start >= end) {
      svgSelection.call(zoomBehavior.transform, zoomIdentity)
      return
    }

    const [xMin, xMax] = xBase.range()
    const chartWidth = xMax - xMin
    const monthWidth = xBase(end) - xBase(start)

    if (!Number.isFinite(monthWidth) || monthWidth <= 0) {
      svgSelection.call(zoomBehavior.transform, zoomIdentity)
      return
    }

    const k = Math.min(50, Math.max(1, chartWidth / monthWidth))
    const tx = xMin - xBase(start) * k

    if (!Number.isFinite(k) || !Number.isFinite(tx)) {
      svgSelection.call(zoomBehavior.transform, zoomIdentity)
      return
    }

    svgSelection.call(
      zoomBehavior.transform,
      zoomIdentity.translate(tx, 0).scale(k),
    )
  }
  finally {
    isMonthDrivenZoom = false
    emitVisibleRange()
  }
}

// -- Lifecycle & watchers --

watch([svgWidth, svgHeight, isDark], () => {
  if (!svgWidth.value || !svgHeight.value)
    return
  // Build (first real size) or rebuild (resize/theme change) SVG skeleton
  initSvg()
  if (!svgNode)
    return
  updateScales()
  updateLayers()
})

watch(() => props.data, () => {
  if (!svgNode)
    return
  // Reset zoom to identity — block cascading handleZoom/handleBrushMove
  isProgrammaticZoom = true
  if (zoomBehavior && svgSelection) {
    svgSelection.call(zoomBehavior.transform, zoomIdentity)
  }
  // updateScales creates new xBase/xScale/yScale/areaGenerator
  updateScales()
  // Now reset brush to match the new xBase full range
  if (brushGroup && brushBehavior && xBase) {
    select(brushGroup).call(brushBehavior.move, xBase.range())
  }
  isProgrammaticZoom = false
  updateLayers()
  // Emit full range so panel data matches the reset view
  emitVisibleRange()
}, { deep: true })

watch(() => props.selectedMonth, () => {
  zoomToMonth(props.selectedMonth)
})

watch(() => props.eventMarkers, () => {
  if (svgNode)
    updateEventMarkers()
}, { deep: true })

watch(monthNames, () => {
  if (svgNode)
    updateScales()
}, { flush: 'post' })

onMounted(() => {
  initSvg()
  updateScales()
  updateLayers()
})

onUnmounted(() => {
  if (rangeRafId) {
    cancelAnimationFrame(rangeRafId)
    rangeRafId = null
  }
  if (interactionTimer) {
    clearTimeout(interactionTimer)
    interactionTimer = null
  }
  if (brushCleanupFallback) {
    window.removeEventListener('pointerup', brushCleanupFallback, true)
    brushCleanupFallback = null
  }
  if (wheelCleanup) {
    wheelCleanup()
    wheelCleanup = null
  }
  if (gestureCleanup) {
    gestureCleanup()
    gestureCleanup = null
  }
  select(window).on('mousemove.brush mouseup.brush keydown.brush keyup.brush', null)
  select(window).on('mousemove.zoom mouseup.zoom', null)
  if (chartRef.value) {
    select(chartRef.value).selectAll('*').remove()
  }
  svgNode = null
  svgSelection = null
  gChartSelection = null
  gBrushGroupSelection = null
  gYAxisGridSelection = null
  gYAxisLabelsSelection = null
  gXAxisSelection = null
  clipRectSelection = null
  gAnnotationsSelection = null
  gLabelsSelection = null
})

/** Externally highlight a contributor's river (from panel hover). */
function highlightContributor(name: string | null) {
  if (!hoverHighlightEl || !areaGenerator)
    return
  if (!name) {
    hoverHighlightEl.style('opacity', 0)
    return
  }
  const layer = series.value.find(s => s.key === name)
  if (layer) {
    hoverHighlightEl
      .datum(layer)
      .attr('d', areaGenerator)
      .style('opacity', 0.85)
  }
}

/** Externally highlight an event marker line (from event panel hover). */
function highlightEventMarker(id: string | null) {
  if (!gEventMarkersSelection)
    return
  gEventMarkersSelection.selectAll('line.event-marker')
    .each(function (this: SVGLineElement, d: any) {
      const el = select(this)
      if (d.id === id) {
        el.attr('stroke-width', 3).attr('opacity', 1)
      }
      else {
        const isSelected = d.selected !== false
        el.attr('stroke-width', 1.5).attr('opacity', isSelected ? 0.6 : 0)
      }
    })
}

defineExpose({
  getSvg: () => svgNode,
  highlightContributor,
  highlightEventMarker,
})
</script>

<template>
  <div class="relative w-full h-full" :style="{ padding: '0 0 1em 0' }">
    <div ref="chartRef" class="w-full h-full overflow-hidden" />
  </div>
</template>

<style>
.reveal-clip-rect {
  animation: layers-reveal 1.2s cubic-bezier(0.33, 1, 0.68, 1) 0.5s both;
  transform-origin: 0 0;
}

@keyframes layers-reveal {
  from {
    transform: scaleX(0);
  }
}
</style>
