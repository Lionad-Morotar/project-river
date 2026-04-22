<script setup lang="ts">
import type { ContributorMeta } from '~/composables/useContributorColors'
import type { DailyRow } from '~/utils/d3Helpers'
import { useElementSize } from '@vueuse/core'
import { extent } from 'd3-array'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { select } from 'd3-selection'
import { curveBasis, area as d3Area } from 'd3-shape'
import { useContributorColors } from '~/composables/useContributorColors'
import { buildStack, pivotDailyData } from '~/utils/d3Helpers'

const props = defineProps<{
  /** Real daily data from static bundle. If empty, renders nothing. */
  dailyData?: DailyRow[]
}>()

const chartRef = ref<HTMLDivElement | null>(null)
const { width, height } = useElementSize(chartRef)

/** Build ContributorMeta[] from DailyRow[] for color generation */
function buildContributorMeta(rows: DailyRow[]): ContributorMeta[] {
  const map = new Map<string, { firstDate: string, totalCommits: number }>()
  for (const row of rows) {
    const existing = map.get(row.contributor)
    if (existing) {
      existing.totalCommits += row.commits
      if (row.date < existing.firstDate)
        existing.firstDate = row.date
    }
    else {
      map.set(row.contributor, { firstDate: row.date, totalCommits: row.commits })
    }
  }
  return Array.from(map.entries()).map(([name, m]) => ({
    name,
    firstCommitDate: m.firstDate,
    totalCommits: m.totalCommits,
  }))
}

function render() {
  if (!chartRef.value || !width.value || !height.value)
    return
  if (!props.dailyData || props.dailyData.length === 0)
    return

  const container = select(chartRef.value)
  container.selectAll('*').remove()

  const data = props.dailyData
  const contributors = Array.from(new Set(data.map(d => d.contributor))).sort()
  const pivotedData = pivotDailyData(data)
  const series = buildStack(contributors, pivotedData)

  // Build real contributor colors
  const contributorMeta = buildContributorMeta(data)
  const isDark = document.documentElement.classList.contains('dark')
  const colorMap = useContributorColors(contributorMeta, isDark)

  const margin = { top: 0, right: 0, bottom: 0, left: 0 }
  const chartHeight = height.value - margin.top - margin.bottom

  const svg = container
    .append('svg')
    .attr('width', width.value)
    .attr('height', height.value)
    .attr('viewBox', [0, 0, width.value, height.value])
    .attr('preserveAspectRatio', 'none')

  const dateExtent = extent(pivotedData, d => d.date) as [Date, Date]

  const xScale = scaleUtc()
    .domain(dateExtent)
    .range([margin.left, width.value - margin.right])

  const yMin = Math.min(...series.map(layer => Math.min(...layer.map(d => d[0]))))
  const yMax = Math.max(...series.map(layer => Math.max(...layer.map(d => d[1]))))

  const yScale = scaleLinear()
    .domain([yMin, yMax])
    .range([chartHeight, 0])

  const areaGen = d3Area<any>()
    .curve(curveBasis)
    .x(d => xScale(d.data.date))
    .y0(d => yScale(d[0]))
    .y1(d => yScale(d[1]))

  // Ambient opacity — subtle background feel
  const baseOpacity = 0.7

  svg.append('g')
    .selectAll('path')
    .data(series)
    .join('path')
    .attr('d', areaGen)
    .attr('fill', (_d, i) => {
      const key = contributors[i]!
      return colorMap.get(key) ?? '#64748b'
    })
    .attr('opacity', baseOpacity)
}

watch([width, height, () => props.dailyData], () => {
  nextTick(render)
})

onMounted(() => {
  nextTick(render)
})
</script>

<template>
  <div ref="chartRef" class="w-full h-full pointer-events-none" />
</template>
