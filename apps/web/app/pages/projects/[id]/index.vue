<script setup lang="ts">
import type { ContributorMeta } from '~/composables/useContributorColors'
import type { DailyRow } from '~/utils/d3Helpers'
import type { MonthlyRow } from '~/utils/monthDetailHelpers'
import { useResizeObserver, useThrottleFn } from '@vueuse/core'
import MonthDetailPanel from '~/components/MonthDetailPanel.vue'
import ProjectLayout from '~/components/ProjectLayout.vue'
import Streamgraph from '~/components/Streamgraph.vue'
import StreamgraphTooltip from '~/components/StreamgraphTooltip.vue'
import { useContributorColors } from '~/composables/useContributorColors'
import { useStreamgraphData } from '~/composables/useStreamgraphData'
import { getAllContributors, getMonthContributors } from '~/utils/monthDetailHelpers'
import { downloadStreamgraphSvg } from '~/utils/svgExport'

const route = useRoute()
const projectId = route.params.id as string

const dailyData = ref<DailyRow[]>([])
const monthlyData = ref<MonthlyRow[]>([])
const selectedMonth = ref<string | null>(null)
const projectName = ref<string>(projectId)
const loading = ref(true)
const error = ref<string | null>(null)

const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  contributor: '',
  date: '',
  commits: 0,
  linesAdded: 0,
  linesDeleted: 0,
  filesTouched: 0,
})

const rawChartWidth = ref(1024)
const rawChartHeight = ref(560)
const chartWidth = ref(rawChartWidth.value)
const chartHeight = ref(rawChartHeight.value)

const debouncedUpdateSize = useThrottleFn(() => {
  chartWidth.value = rawChartWidth.value
  chartHeight.value = rawChartHeight.value
}, 150)

watch([rawChartWidth, rawChartHeight], () => {
  debouncedUpdateSize()
})

const availableMonths = computed(() => Array.from(new Set(monthlyData.value.map(m => m.yearMonth))).sort())

const graphContainerRef = ref<HTMLDivElement | null>(null)
const streamgraphRef = ref<{ getSvg: () => SVGSVGElement | null } | null>(null)

const streamgraphData = computed(() => useStreamgraphData(dailyData.value).filteredRows)

const contributorMetaList = computed<ContributorMeta[]>(() => {
  const firstDateMap = new Map<string, string>()
  const totalMap = new Map<string, number>()
  for (const row of streamgraphData.value) {
    const existing = firstDateMap.get(row.contributor)
    if (!existing || row.date < existing) {
      firstDateMap.set(row.contributor, row.date)
    }
    totalMap.set(row.contributor, (totalMap.get(row.contributor) || 0) + row.commits)
  }
  const result: ContributorMeta[] = []
  for (const [name, firstCommitDate] of firstDateMap) {
    result.push({ name, firstCommitDate, totalCommits: totalMap.get(name) || 0 })
  }
  return result
})

const colorMap = computed(() => useContributorColors(contributorMetaList.value))
const hasData = computed(() => dailyData.value.length > 0)
const isAllHistory = computed(() => !selectedMonth.value)
const panelContributors = computed(() => {
  if (!selectedMonth.value)
    return getAllContributors(monthlyData.value, dailyData.value, colorMap.value)
  return getMonthContributors(monthlyData.value, dailyData.value, selectedMonth.value, colorMap.value)
})
const commitsThisMonth = computed(() => panelContributors.value.reduce((sum, c) => sum + c.monthlyCommits, 0))
const totalCommitsToDate = computed(() => panelContributors.value.reduce((sum, c) => sum + c.cumulativeCommits, 0))

// Observe container resize (debounced by browser, no manual listener cleanup)
useResizeObserver(graphContainerRef, (entries: any[]) => {
  const entry = entries[0]
  if (entry) {
    const { width, height } = entry.contentRect
    if (width > 0)
      rawChartWidth.value = Math.round(width)
    if (height > 0)
      rawChartHeight.value = Math.round(height)
  }
})

onMounted(async () => {
  try {
    const [daily, monthly] = await Promise.all([
      $fetch<DailyRow[]>(`/api/projects/${projectId}/daily-aggregated`),
      $fetch<MonthlyRow[]>(`/api/projects/${projectId}/monthly`),
    ])
    dailyData.value = daily
    monthlyData.value = monthly
    if (availableMonths.value.length > 0) {
      selectedMonth.value = availableMonths.value[availableMonths.value.length - 1] ?? null
    }
  }
  catch (err: any) {
    const msg = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Failed to load project data. Please check your connection and try again.'
    error.value = msg
  }
  finally {
    loading.value = false
  }
})

function handleExport() {
  const contributors = Array.from(new Set(streamgraphData.value.map((d: DailyRow) => d.contributor))).sort()
  downloadStreamgraphSvg(
    streamgraphRef.value?.getSvg?.() ?? null,
    `project-${projectId}-streamgraph.svg`,
    contributors,
    colorMap.value,
  )
}

function onHover(event: PointerEvent, payload: { contributor: string, date: string, commits: number, linesAdded: number, linesDeleted: number, filesTouched: number } | null) {
  if (!payload || !graphContainerRef.value) {
    tooltip.value.visible = false
    return
  }
  // Position relative to the graph container
  const rect = graphContainerRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // Keep tooltip inside container bounds
  const tipW = 180
  const tipH = 120
  const finalX = x + tipW + 16 > rect.width ? x - tipW - 8 : x + 16
  const finalY = y + tipH + 16 > rect.height ? y - tipH - 8 : y + 16

  tooltip.value.visible = true
  tooltip.value.x = finalX
  tooltip.value.y = finalY
  tooltip.value.contributor = payload.contributor
  tooltip.value.date = payload.date
  tooltip.value.commits = payload.commits
  tooltip.value.linesAdded = payload.linesAdded
  tooltip.value.linesDeleted = payload.linesDeleted
  tooltip.value.filesTouched = payload.filesTouched
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex flex-col">
    <div class="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col flex-1 w-full">
      <!-- Header -->
      <header class="mb-6">
        <h1 class="text-xl font-semibold text-slate-100 tracking-tight">
          {{ projectName }}
        </h1>
      </header>

      <div v-if="loading" class="text-slate-400 text-sm">
        Loading...
      </div>

      <div
        v-else-if="error"
        class="rounded-md border border-red-800 bg-red-950/40 p-4 text-red-200 text-sm"
      >
        {{ error }}
      </div>

      <div v-else-if="dailyData.length === 0" class="text-center py-16">
        <h2 class="text-lg font-medium text-slate-300 mb-2">
          No data available yet
        </h2>
        <p class="text-slate-500 text-sm">
          Run the CLI analyzer on a repository to see the Streamgraph here.
        </p>
      </div>

      <div v-else>
        <!-- Controls row -->
        <div class="flex items-center gap-3 mb-4">
          <MonthSelector
            v-model="selectedMonth"
            :months="availableMonths"
          />
          <button
            class="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors"
            @click="selectedMonth = null"
          >
            Show All History
          </button>
        </div>

        <!-- Chart + Panel Layout -->
        <ProjectLayout class="flex-1 border border-slate-800 rounded-md min-h-0">
          <template #chart>
            <div
              ref="graphContainerRef"
              class="relative w-full h-full"
            >
              <Streamgraph
                ref="streamgraphRef"
                :data="streamgraphData"
                :width="chartWidth"
                :height="chartHeight"
                :selected-month="selectedMonth"
                :colors="colorMap"
                @update:selected-month="selectedMonth = $event"
                @hover="onHover"
              />
              <StreamgraphTooltip
                :visible="tooltip.visible"
                :x="tooltip.x"
                :y="tooltip.y"
                :contributor="tooltip.contributor"
                :date="tooltip.date"
                :commits="tooltip.commits"
                :lines-added="tooltip.linesAdded"
                :lines-deleted="tooltip.linesDeleted"
                :files-touched="tooltip.filesTouched"
              />
            </div>
          </template>

          <template #panel>
            <MonthDetailPanel
              v-model:selected-month="selectedMonth"
              :available-months="availableMonths"
              :contributors="panelContributors"
              :commits-this-month="commitsThisMonth"
              :total-commits-to-date="totalCommitsToDate"
              :has-data="hasData"
              :is-all-history="isAllHistory"
              @export="handleExport"
            />
          </template>
        </ProjectLayout>
      </div>
    </div>
  </div>
</template>
