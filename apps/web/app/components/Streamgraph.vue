<script setup lang="ts">
import type { DailyRow } from '~/utils/d3Helpers'
import { extent, max, min } from 'd3-array'
import { axisBottom, axisLeft } from 'd3-axis'
import { brushX as d3BrushX } from 'd3-brush'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { select } from 'd3-selection'
import { curveBasis, area as d3Area } from 'd3-shape'
import { zoom as d3Zoom } from 'd3-zoom'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useContributorColors } from '~/composables/useContributorColors'
import { buildStack, pivotDailyData } from '~/utils/d3Helpers'

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

let svgNode: SVGSVGElement | null = null
let gChart: any = null
let gXAxis: any = null
let gYAxis: any = null
let gBrushGroup: any = null
let brushGroup: any = null
let xBase: any = null
let xScale: any = null
let yScale: any = null
let zoomBehavior: any = null
let brushBehavior: any = null
let areaGenerator: any = null
let layers: any = null
let monthHighlight: any = null

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

  xScale = xBase.copy()

  yScale = scaleLinear()
    .domain(yDomain.value)
    .range([chartHeight, 0])

  // area generator (computed once, reused)
  areaGenerator = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => xScale(d.data.date))
    .y0((d: any) => yScale(d[0]))
    .y1((d: any) => yScale(d[1]))

  // groups
  gChart = svg.append('g')
    .attr('clip-path', 'url(#clip)')

  // month highlight overlay
  monthHighlight = gChart.append('rect')
    .attr('class', 'month-highlight')
    .attr('fill', 'rgba(59,130,246,0.15)')
    .attr('y', marginTop)
    .attr('height', chartHeight)
    .style('display', 'none')
    .style('pointer-events', 'none')

  // axis groups
  gXAxis = svg.append('g')
    .attr('transform', `translate(0,${marginTop + chartHeight})`)

  gYAxis = svg.append('g')
    .attr('transform', `translate(${marginLeft},${marginTop})`)

  const xAxis = axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 80)))
  const yAxis = axisLeft(yScale).ticks(5)

  gXAxis.call(xAxis)
  gYAxis.call(yAxis)

  // layers
  layers = gChart.selectAll('path.layer')
    .data(series.value)
    .join('path')
    .attr('class', 'layer')
    .attr('fill', (d: any) => colorMap.value.get(d.key) || '#999')
    .attr('d', areaGenerator)
    .style('cursor', 'pointer')

  // pointer events for hover
  layers
    .on('pointerenter pointermove', (event: PointerEvent, d: any) => {
      event.preventDefault()
      const contributor = d.key as string
      const [px] = d3.pointer(event, svg.node())
      const date = xScale.invert(px)
      const isoDate = date.toISOString().split('T')[0]

      const row = props.data.find(r => r.contributor === contributor && r.date === isoDate)
        || props.data.find(r => r.contributor === contributor && Math.abs(new Date(r.date).getTime() - date.getTime()) <= 86400000)
        || null

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
  zoomBehavior = d3Zoom()
    .scaleExtent([1, 50])
    .extent([[marginLeft, 0], [props.width - marginRight, marginTop + chartHeight]])
    .translateExtent([[marginLeft, -Infinity], [props.width - marginRight, Infinity]])
    .on('zoom', (event: any) => {
      if (event.sourceEvent?.type === 'brush')
        return
      const newX = event.transform.rescaleX(xBase)
      xScale.domain(newX.domain())
      gXAxis.call(axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 80))))
      layers.attr('d', areaGenerator)
      updateMonthHighlight()
      if (brushGroup) {
        brushGroup.call(brushBehavior.move, xBase.range().map(event.transform.invertX, event.transform))
      }
    })

  svg.call(zoomBehavior)

  // brush navigator
  brushBehavior = d3BrushX()
    .extent([[marginLeft, 0.5], [props.width - marginRight, brushHeight - 0.5]])
    .on('brush end', (event: any) => {
      if (!event.selection || event.sourceEvent?.type === 'zoom')
        return
      const [x0, x1] = event.selection.map(xBase.invert, xBase)
      const k = (xBase.domain()[1].getTime() - xBase.domain()[0].getTime()) / (x1.getTime() - x0.getTime())
      const tx = -xBase(x0) * k + marginLeft
      svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, 0).scale(k))
    })

  gBrushGroup = svg.append('g')
    .attr('transform', `translate(0, ${props.height - marginBottom - brushHeight + brushGap})`)

  // mini chart for brush background
  const yBrush = scaleLinear()
    .domain(yDomain.value)
    .range([brushHeight - 1, 1])

  const brushArea = d3Area<any>()
    .curve(curveBasis)
    .x((d: any) => xBase(d.data.date))
    .y0((d: any) => yBrush(d[0]))
    .y1((d: any) => yBrush(d[1]))

  gBrushGroup.selectAll('path.brush-layer')
    .data(series.value)
    .join('path')
    .attr('class', 'brush-layer')
    .attr('fill', (d: any) => colorMap.value.get(d.key) || '#999')
    .attr('opacity', 0.4)
    .attr('d', brushArea)

  brushGroup = gBrushGroup.append('g')
    .attr('class', 'brush')
    .call(brushBehavior)
    .call(brushBehavior.move, xBase.range())

  updateMonthHighlight()
}

function updateMonthHighlight() {
  if (!monthHighlight || !props.selectedMonth || !xScale) {
    if (monthHighlight)
      monthHighlight.style('display', 'none')
    return
  }
  const start = new Date(`${props.selectedMonth}-01T00:00:00Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)

  const x0 = xScale(start)
  const x1 = xScale(end)
  const chartWidth = props.width - marginLeft - marginRight

  // clamp to visible chart area inside clip
  const visibleX0 = Math.max(marginLeft, Math.min(x0, marginLeft + chartWidth))
  const visibleX1 = Math.max(marginLeft, Math.min(x1, marginLeft + chartWidth))

  if (visibleX1 > visibleX0) {
    monthHighlight
      .attr('x', visibleX0)
      .attr('width', visibleX1 - visibleX0)
      .style('display', 'block')
  }
  else {
    monthHighlight.style('display', 'none')
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
