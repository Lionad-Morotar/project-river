<script setup lang="ts">
import type { DailyRow } from '~/utils/d3Helpers'
import { extent, max, min } from 'd3-array'
import { axisBottom, axisLeft } from 'd3-axis'
import { brushX as d3BrushX } from 'd3-brush'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { pointer as d3Pointer, select } from 'd3-selection'
import { curveBasis, area as d3Area } from 'd3-shape'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildStack, pivotDailyData } from '~/utils/d3Helpers'

/** Type aliases for D3 internals (sub-packages lack built-in .d.ts) */
type D3ScaleLinear = ReturnType<typeof scaleLinear>
type D3ScaleUtc = ReturnType<typeof scaleUtc>
type D3AreaGenerator = ReturnType<typeof d3Area<any>>
type D3BrushXBehavior = ReturnType<typeof d3BrushX>
type D3ZoomBehavior = ReturnType<typeof d3Zoom>

interface Props {
  data: DailyRow[]
  width: number
  height: number
  selectedMonth: string | null
  colors: Map<string, string>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedMonth', value: string | null): void
  (e: 'hover', event: PointerEvent, payload: { contributor: string, date: string, commits: number, linesAdded: number, linesDeleted: number, filesTouched: number, percentage: number } | null): void
}>()

const chartRef = ref<HTMLDivElement | null>(null)

const marginTop = 24
const marginRight = 24
const marginBottom = 24
const marginLeft = 48
const brushHeight = 50
const brushGap = 16
const MIN_THICKNESS_PX = 2
const HIT_AREA_PX = 6
const MAX_SPIKE_MARKERS = 5
const MAX_CONTRIBUTOR_LABELS = 8

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
let brushCleanupFallback: ((e: PointerEvent) => void) | null = null

// D3 selections that persist across updates
let svgSelection: ReturnType<typeof select> | null = null
let gChartSelection: ReturnType<typeof select> | null = null
let gBrushGroupSelection: ReturnType<typeof select> | null = null
let gYAxisGridSelection: ReturnType<typeof select> | null = null
let gYAxisLabelsSelection: ReturnType<typeof select> | null = null
let gXAxisSelection: ReturnType<typeof select> | null = null
let clipRectSelection: ReturnType<typeof select> | null = null
let gAnnotationsSelection: ReturnType<typeof select> | null = null
let gLabelsSelection: ReturnType<typeof select> | null = null

/** Smart time format adapting to visible time span */
function smartTimeFormat(date: Date): string {
  if (!xScale)
    return ''
  const domain = xScale.domain()
  const span = (domain[1] as number) - (domain[0] as number)
  const oneYear = 365.25 * 86400000
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  if (span > 5 * oneYear)
    return date.getMonth() === 0 ? `${date.getFullYear()}` : ''
  if (span > oneYear)
    return date.getMonth() === 0 ? `${date.getFullYear()}` : months[date.getMonth()]!
  if (span > 90 * 86400000)
    return `${months[date.getMonth()]} ${date.getFullYear()}`
  return `${months[date.getMonth()]} ${date.getDate()}`
}

/** Dark theme axis colors */
const AXIS_COLOR = '#94a3b8' // slate-400
const TICK_COLOR = '#94a3b8' // slate-400
const GRID_COLOR = '#334155' // slate-700
const HIGHLIGHT_COLOR = 'rgba(56,189,248,0.15)'
const BRUSH_BG = '#0f172a' // slate-900
const BRUSH_STROKE = '#475569' // slate-600

// -- Hover handlers (extracted so they can be reused in data-join) --

function handleHover(event: PointerEvent, d: any) {
  event.preventDefault()
  if (!xScale || !svgSelection)
    return
  const contributor = d.key as string
  const [px] = d3Pointer(event, svgSelection.node())
  const date = xScale.invert(px)
  const isoDate = date.toISOString().split('T')[0]

  const lookup = dataLookup.value
  const dateMap = lookup.get(contributor)
  if (!dateMap)
    return

  // O(1) exact match first, then nearest-day fallback
  let row = dateMap.get(isoDate) ?? null
  if (!row) {
    const targetTime = date.getTime()
    let minDelta = Infinity
    for (const r of dateMap.values()) {
      const delta = Math.abs(new Date(r.date).getTime() - targetTime)
      if (delta < minDelta) {
        minDelta = delta
        row = r
      }
    }
    if (minDelta > 86400000)
      row = null
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
    })
  }
}

function handleLeave(event: PointerEvent) {
  emit('hover', event, null)
}

// -- SVG skeleton: only runs once per mount / resize --

function initSvg() {
  if (!chartRef.value || !props.width || !props.height)
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

  const svg = container
    .append('svg')
    .attr('width', props.width)
    .attr('height', props.height)
    .attr('viewBox', [0, 0, props.width, props.height])
    .attr('style', 'max-width: 100%; height: auto; user-select: none; -webkit-user-select: none;')

  svgNode = svg.node() as SVGSVGElement
  svgSelection = svg

  const chartWidth = props.width - marginLeft - marginRight
  const chartHeight = props.height - marginTop - marginBottom - brushHeight - brushGap

  // defs / clipPath
  const clipRect = svg.append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', marginLeft)
    .attr('y', marginTop)
    .attr('width', chartWidth)
    .attr('height', chartHeight)
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
    .attr('fill', HIGHLIGHT_COLOR)
    .attr('y', marginTop)
    .attr('height', chartHeight)
    .style('display', 'none')
    .style('pointer-events', 'none')
  monthHighlight = highlightSel.node() as SVGRectElement

  // Layers container (paths will be added via data-join)
  gChartSelection.append('g').attr('class', 'layers')

  // Annotations container (vertical spike markers)
  gAnnotationsSelection = gChartSelection.append('g').attr('class', 'annotations')

  // Inline labels container (contributor names at widest points)
  gLabelsSelection = gChartSelection.append('g').attr('class', 'labels')

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
    .attr('transform', `translate(0, ${props.height - brushHeight})`)

  // Brush background rect
  gBrushGroupSelection.append('rect')
    .attr('class', 'brush-bg')
    .attr('x', marginLeft)
    .attr('width', chartWidth)
    .attr('height', brushHeight)
    .attr('fill', BRUSH_BG)
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
    .attr('stroke', GRID_COLOR)
    .attr('stroke-width', 1)

  // Setup zoom behavior
  zoomBehavior = d3Zoom()
    .scaleExtent([1, 50])
    .extent([[marginLeft, 0], [props.width - marginRight, marginTop + chartHeight]])
    .translateExtent([[marginLeft, -Infinity], [props.width - marginRight, Infinity]])
    .on('zoom', handleZoom)

  svg.call(zoomBehavior)
    // prevent scroll-to-zoom on the page
    .on('wheel.zoom', null)

  // Restore zoom transform after resize re-render
  if (savedTransform && zoomBehavior) {
    svg.call(zoomBehavior.transform, savedTransform)
  }

  // Setup brush behavior
  brushBehavior = d3BrushX()
    .extent([[marginLeft, 0.5], [props.width - marginRight, brushHeight - 0.5]])
    .on('start end', handleBrushStartEnd)
    .on('brush end', handleBrushMove)

  const brushGroupSel = gBrushGroupSelection.append('g')
    .attr('class', 'brush')
    .call(brushBehavior)

  brushGroup = brushGroupSel.node() as SVGGElement

  // Style brush handles
  brushGroupSel.selectAll('.selection').attr('fill', 'rgba(59,130,246,0.1)').attr('stroke', BRUSH_STROKE)
  brushGroupSel.selectAll('.handle').attr('fill', '#94a3b8').attr('rx', 2)
}

// -- Zoom handler --

function handleZoom(event: any) {
  if (!xBase || !gXAxisEl || !gXAxisSelection || !areaGenerator)
    return
  if (event.sourceEvent?.type === 'brush')
    return

  const chartWidth = props.width - marginLeft - marginRight
  const newX = event.transform.rescaleX(xBase)
  xScale!.domain(newX.domain())

  gXAxisSelection.call(axisBottom(xScale!).ticks(Math.max(2, Math.floor(chartWidth / 80))))
  gXAxisSelection.call(g => g.select('.domain').attr('stroke', AXIS_COLOR))
  gXAxisSelection.call(g => g.selectAll('.tick line').attr('stroke', AXIS_COLOR))
  gXAxisSelection.call(g => g.selectAll('.tick text').attr('fill', TICK_COLOR).attr('font-size', '11px'))

  updateLayerPaths()
  updateMonthHighlight()

  if (brushGroup && brushBehavior && !isProgrammaticZoom) {
    isProgrammaticZoom = true
    select(brushGroup).call(brushBehavior.move, xBase.range().map(event.transform.invertX, event.transform))
    isProgrammaticZoom = false
  }
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
}

// -- Scale computation (called on init, resize, and data change) --

function updateScales() {
  if (!svgSelection || !props.width || !props.height)
    return

  const chartWidth = props.width - marginLeft - marginRight
  const chartHeight = props.height - marginTop - marginBottom - brushHeight - brushGap

  // Update clipPath dimensions
  if (clipRectSelection) {
    clipRectSelection
      .attr('width', chartWidth)
      .attr('height', chartHeight)
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
    .range([marginLeft, props.width - marginRight])

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

  // Update horizontal grid lines
  if (gChartSelection) {
    const gridLines = gChartSelection.select('.grid-lines')
    gridLines.selectAll('*').remove()
    const yTicks = yScale.ticks(5)
    for (const tick of yTicks) {
      gridLines.append('line')
        .attr('x1', marginLeft)
        .attr('x2', marginLeft + chartWidth)
        .attr('y1', yScale(tick))
        .attr('y2', yScale(tick))
        .attr('stroke', GRID_COLOR)
        .attr('stroke-width', 0.5)
    }
  }

  // Update X-axis
  if (gXAxisSelection) {
    gXAxisSelection
      .attr('transform', `translate(0,${marginTop + chartHeight})`)
      .call(axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 80))).tickFormat(smartTimeFormat))
      .call(g => g.select('.domain').attr('stroke', AXIS_COLOR))
      .call(g => g.selectAll('.tick line').attr('stroke', AXIS_COLOR))
      .call(g => g.selectAll('.tick text').attr('fill', TICK_COLOR).attr('font-size', '11px'))
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
      .call(g => g.selectAll('.tick line').attr('stroke', GRID_COLOR).attr('stroke-width', 0.5))
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
      .call(g => g.selectAll('.tick text').attr('fill', TICK_COLOR).attr('font-size', '11px'))
  }

  // Update brush group position and internal elements
  if (gBrushGroupSelection) {
    gBrushGroupSelection.attr('transform', `translate(0, ${props.height - brushHeight})`)

    gBrushGroupSelection.select('.brush-bg')
      .attr('width', chartWidth)

    gBrushGroupSelection.select('.brush-separator')
      .attr('x2', marginLeft + chartWidth)

    // Update brush extent
    if (brushBehavior) {
      brushBehavior.extent([[marginLeft, 0.5], [props.width - marginRight, brushHeight - 0.5]])
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

  layersContainer.selectAll('g.layer-group')
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
          .attr('fill', (d: any) => props.colors.get(d.key) || '#999')
          .style('pointer-events', 'none')

        return g
      },
      update => update,
      exit => exit.remove(),
    )

  // Update visual paths
  layersContainer.selectAll('path.layer-visual')
    .attr('fill', (d: any) => props.colors.get(d.key) || '#999')
    .attr('d', areaGenerator)

  // Update hit area paths
  if (hitAreaGenerator) {
    layersContainer.selectAll('path.layer-hitarea')
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
        .attr('fill', (d: any) => props.colors.get(d.key) || '#999')
        .attr('opacity', 0.4),
      update => update
        .attr('fill', (d: any) => props.colors.get(d.key) || '#999'),
      exit => exit.remove(),
    )
    .attr('d', brushAreaGen)

  // Reset brush to full range if it's the first render
  if (brushGroup && brushBehavior) {
    const brushSel = select(brushGroup)
    const currentSelection = d3BrushX.selection(brushSel) as [number, number] | null
    // Only move brush to full range on initial setup (no existing selection)
    if (!currentSelection) {
      brushSel.call(brushBehavior.move, xBase.range())
    }
  }

  updateMonthHighlight()
  updateAnnotations()
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
  updateLabels()
}

function updateMonthHighlight() {
  if (!monthHighlight || !props.selectedMonth || !xScale) {
    if (monthHighlight)
      select(monthHighlight).style('display', 'none')
    return
  }
  const start = new Date(`${props.selectedMonth}-01T00:00:00Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)

  const x0 = xScale(start)
  const x1 = xScale(end)
  const cw = props.width - marginLeft - marginRight

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
  const chartHeight = props.height - marginTop - marginBottom - brushHeight - brushGap

  const spikeData = spikeDates.value.map(date => ({
    date,
    x: xScale(new Date(date)),
  })).filter(d => Number.isFinite(d.x))

  gAnnotationsSelection.selectAll('line.spike')
    .data(spikeData, (d: any) => d.date)
    .join(
      enter => enter.append('line')
        .attr('class', 'spike')
        .attr('stroke', '#94a3b8')
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
        .attr('fill', (d: any) => props.colors.get(d.contributor) || '#999')
        .attr('font-size', '10px')
        .attr('font-weight', 500)
        .attr('opacity', 0.65)
        .style('pointer-events', 'none')
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

  if (!month) {
    // Reset to full range
    svgSelection.call(zoomBehavior.transform, zoomIdentity)
    return
  }

  const domain = xBase.domain()
  let start = new Date(`${month}-01T00:00:00Z`)
  let end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)

  // Clamp to available data domain to avoid invalid scales
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

  // Safety guards against invalid dates or degenerate domains
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

// -- Lifecycle & watchers --

watch([() => props.width, () => props.height], () => {
  if (!svgNode)
    return
  // Resize: rebuild SVG skeleton (dimensions changed), then update scales + layers
  initSvg()
  updateScales()
  updateLayers()
})

watch(() => props.data, () => {
  if (!svgNode)
    return
  // Data change: only update scales + layers, NO SVG rebuild
  updateScales()
  updateLayers()
}, { deep: true })

watch(() => props.selectedMonth, () => {
  zoomToMonth(props.selectedMonth)
})

onMounted(() => {
  initSvg()
  updateScales()
  updateLayers()
})

onUnmounted(() => {
  if (brushCleanupFallback) {
    window.removeEventListener('pointerup', brushCleanupFallback, true)
    brushCleanupFallback = null
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

defineExpose({
  getSvg: () => svgNode,
})
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="chartRef" class="w-full h-full" />
  </div>
</template>
