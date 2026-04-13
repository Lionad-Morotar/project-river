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
import { useContributorColors } from '~/composables/useContributorColors'
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
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedMonth', value: string | null): void
  (e: 'hover', value: { contributor: string, date: string, commits: number, linesAdded: number, linesDeleted: number, filesTouched: number } | null): void
}>()

const chartRef = ref<HTMLDivElement | null>(null)

const marginTop = 20
const marginRight = 30
const marginBottom = 50
const marginLeft = 50
const brushHeight = 60
const brushGap = 20

const contributors = computed(() => {
  const set = new Set<string>()
  for (const row of props.data) {
    set.add(row.contributor)
  }
  return Array.from(set).sort()
})

const colorMap = computed(() => useContributorColors(contributors.value))

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

/** O(1) hover lookup: contributor → date → row */
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

let svgNode: SVGSVGElement | null = null
let gXAxis: SVGGElement | null = null
let brushGroup: SVGGElement | null = null
let xBase: D3ScaleUtc | null = null
let xScale: D3ScaleLinear | null = null
let yScale: D3ScaleLinear | null = null
let zoomBehavior: D3ZoomBehavior | null = null
let brushBehavior: D3BrushXBehavior | null = null
let areaGenerator: D3AreaGenerator | null = null
let monthHighlight: SVGRectElement | null = null

function render() {
  if (!chartRef.value || !props.width || !props.height)
    return

  const container = select(chartRef.value)
  container.selectAll('*').remove()

  const svg = container
    .append('svg')
    .attr('width', props.width)
    .attr('height', props.height)
    .attr('viewBox', [0, 0, props.width, props.height])
    .attr('style', 'max-width: 100%; height: auto;')

  svgNode = svg.node() as SVGSVGElement | null

  const chartWidth = props.width - marginLeft - marginRight
  const chartHeight = props.height - marginTop - marginBottom - brushHeight - brushGap

  // defs / clipPath
  svg.append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', marginLeft)
    .attr('y', marginTop)
    .attr('width', chartWidth)
    .attr('height', chartHeight)

  // scales
  const dateExtent = extent(pivotedData.value, d => d.date) as [Date, Date]
  xBase = scaleUtc()
    .domain(dateExtent)
    .range([marginLeft, props.width - marginRight])

  xScale = xBase.copy() as D3ScaleLinear

  yScale = scaleLinear()
    .domain(yDomain.value)
    .range([chartHeight, 0])

  // area generator (computed once per render, reused)
  const currentXScale = xScale
  const currentYScale = yScale
  areaGenerator = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => currentXScale(d.data.date))
    .y0((d: any) => currentYScale(d[0]))
    .y1((d: any) => currentYScale(d[1]))

  // groups
  const gChartSel = svg.append('g')
    .attr('clip-path', 'url(#clip)')

  // month highlight overlay
  const highlightSel = gChartSel.append('rect')
    .attr('class', 'month-highlight')
    .attr('fill', 'rgba(59,130,246,0.15)')
    .attr('y', marginTop)
    .attr('height', chartHeight)
    .style('display', 'none')
    .style('pointer-events', 'none')
  monthHighlight = highlightSel.node() as SVGRectElement

  // axis groups
  const gXAxisSel = svg.append('g')
    .attr('transform', `translate(0,${marginTop + chartHeight})`)
  gXAxis = gXAxisSel.node() as SVGGElement

  const gYAxisSel = svg.append('g')
    .attr('transform', `translate(${marginLeft},${marginTop})`)

  const xAxis = axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 80)))
  const yAxis = axisLeft(yScale).ticks(5)

  gXAxisSel.call(xAxis)
  gYAxisSel.call(yAxis)

  // layers
  const layers = gChartSel.selectAll('path.layer')
    .data(series.value)
    .join('path')
    .attr('class', 'layer')
    .attr('fill', (d: any) => colorMap.value.get(d.key) || '#999')
    .attr('d', areaGenerator)
    .style('cursor', 'pointer')

  // pointer events for hover — O(1) lookup via dataLookup
  const lookup = dataLookup.value
  const currentXScaleForHover = xScale
  layers
    .on('pointerenter pointermove', (event: PointerEvent, d: any) => {
      event.preventDefault()
      const contributor = d.key as string
      const [px] = d3Pointer(event, svg.node())
      const date = currentXScaleForHover.invert(px)
      const isoDate = date.toISOString().split('T')[0]

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
        emit('hover', {
          contributor: row.contributor,
          date: row.date,
          commits: row.commits,
          linesAdded: row.linesAdded,
          linesDeleted: row.linesDeleted,
          filesTouched: row.filesTouched,
        })
      }
    })
    .on('pointerleave', () => {
      emit('hover', null)
    })

  // zoom behavior
  const currentXBase = xBase
  zoomBehavior = d3Zoom()
    .scaleExtent([1, 50])
    .extent([[marginLeft, 0], [props.width - marginRight, marginTop + chartHeight]])
    .translateExtent([[marginLeft, -Infinity], [props.width - marginRight, Infinity]])
    .on('zoom', (event: any) => {
      if (event.sourceEvent?.type === 'brush')
        return
      const newX = event.transform.rescaleX(currentXBase)
      xScale!.domain(newX.domain())
      select(gXAxis!).call(axisBottom(xScale!).ticks(Math.max(2, Math.floor(chartWidth / 80))))
      layers.attr('d', areaGenerator)
      updateMonthHighlight()
      if (brushGroup && brushBehavior) {
        select(brushGroup).call(brushBehavior.move, currentXBase.range().map(event.transform.invertX, event.transform))
      }
    })

  svg.call(zoomBehavior)

  // brush navigator
  brushBehavior = d3BrushX()
    .extent([[marginLeft, 0.5], [props.width - marginRight, brushHeight - 0.5]])
    .on('brush end', (event: any) => {
      if (!event.selection || event.sourceEvent?.type === 'zoom')
        return
      const [x0, x1] = event.selection.map(currentXBase.invert, currentXBase)
      const k = (currentXBase.domain()[1].getTime() - currentXBase.domain()[0].getTime()) / (x1.getTime() - x0.getTime())
      const tx = -currentXBase(x0) * k + marginLeft
      svg.call(zoomBehavior!.transform, zoomIdentity.translate(tx, 0).scale(k))
    })

  const gBrushGroupSel = svg.append('g')
    .attr('transform', `translate(0, ${props.height - marginBottom - brushHeight + brushGap})`)

  // mini chart for brush background
  const yBrush = scaleLinear()
    .domain(yDomain.value)
    .range([brushHeight - 1, 1])

  const brushArea = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => currentXBase(d.data.date))
    .y0((d: any) => yBrush(d[0]))
    .y1((d: any) => yBrush(d[1]))

  gBrushGroupSel.selectAll('path.brush-layer')
    .data(series.value)
    .join('path')
    .attr('class', 'brush-layer')
    .attr('fill', (d: any) => colorMap.value.get(d.key) || '#999')
    .attr('opacity', 0.4)
    .attr('d', brushArea)

  const brushGroupSel = gBrushGroupSel.append('g')
    .attr('class', 'brush')
    .call(brushBehavior)
    .call(brushBehavior.move, currentXBase.range())
  brushGroup = brushGroupSel.node() as SVGGElement

  updateMonthHighlight()
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

watch([() => props.width, () => props.height], () => {
  render()
})

watch(() => props.data, () => {
  render()
}, { deep: true })

watch(() => props.selectedMonth, () => {
  updateMonthHighlight()
})

onMounted(() => {
  render()
})

onUnmounted(() => {
  if (chartRef.value) {
    select(chartRef.value).selectAll('*').remove()
  }
  svgNode = null
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
