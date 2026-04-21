<script setup lang="ts">
import type { DailyRow } from '~/utils/d3Helpers'
import { useElementSize } from '@vueuse/core'
import { extent } from 'd3-array'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { select } from 'd3-selection'
import { curveBasis, area as d3Area } from 'd3-shape'
import { buildStack, pivotDailyData } from '~/utils/d3Helpers'

const CONTRIBUTORS = [
  'antfu',
  'posva',
  'yyx990803',
  'kiaking',
  'danielroe',
  'Atinux',
  'pi0',
  'benjamincanac',
  'farnabaz',
  'hijoblend',
]

/** Generate synthetic daily data that produces a pleasing streamgraph shape */
function generateSyntheticData(): DailyRow[] {
  const startDate = new Date('2022-01-01')
  const days = 365 * 2 + 100
  const rows: DailyRow[] = []

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    const t = i / days

    for (let ci = 0; ci < CONTRIBUTORS.length; ci++) {
      const name = CONTRIBUTORS[ci]!
      // Each contributor has a unique "activity window" via phase-shifted bell curves
      const phase = (ci / CONTRIBUTORS.length) * Math.PI * 2
      const center = 0.3 + (ci % 3) * 0.25
      const spread = 0.2 + (ci % 4) * 0.05
      const dist = Math.abs(t - center)
      const envelope = Math.exp(-(dist * dist) / (2 * spread * spread))
      // Add slow oscillation for organic feel
      const oscillation = Math.sin(t * Math.PI * 6 + phase) * 0.3 + 0.7
      // Add daily noise
      const noise = Math.random() * 0.4 + 0.6
      const base = envelope * oscillation * noise
      const commits = Math.floor(base * 12)

      if (commits > 0) {
        rows.push({
          date: dateStr,
          contributor: name,
          commits,
          linesAdded: commits * 40 + Math.floor(Math.random() * 100),
          linesDeleted: commits * 15 + Math.floor(Math.random() * 50),
          filesTouched: Math.max(1, Math.floor(commits * 1.5)),
          cumulativeCommits: 0,
        })
      }
    }
  }

  return rows
}

const chartRef = ref<HTMLDivElement | null>(null)
const { width, height } = useElementSize(chartRef)

const data = generateSyntheticData()
const contributors = Array.from(new Set(data.map(d => d.contributor))).sort()
const pivotedData = pivotDailyData(data)
const series = buildStack(contributors, pivotedData)

function generateColors(count: number, isDark: boolean): string[] {
  const colors: string[] = []
  for (let i = 0; i < count; i++) {
    const hue = 160 + (i / Math.max(count, 1)) * 140
    const sat = isDark ? 45 : 55
    const light = isDark ? 52 : 45
    colors.push(`hsl(${Math.round(hue)}, ${sat}%, ${light}%)`)
  }
  return colors
}

function render() {
  if (!chartRef.value || !width.value || !height.value)
    return

  const container = select(chartRef.value)
  container.selectAll('*').remove()

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

  // Detect dark mode from document class
  const isDark = document.documentElement.classList.contains('dark')
  const colors = generateColors(contributors.length, isDark)

  // Base opacity — subtle ambient feel, slightly stronger for charcoal bg
  const baseOpacity = isDark ? 0.12 : 0.06

  svg.append('g')
    .selectAll('path')
    .data(series)
    .join('path')
    .attr('d', areaGen)
    .attr('fill', (_d, i) => colors[i]!)
    .attr('opacity', baseOpacity)
}

watch([width, height], () => {
  nextTick(render)
})

onMounted(() => {
  nextTick(render)
})
</script>

<template>
  <div ref="chartRef" class="w-full h-full pointer-events-none" />
</template>
