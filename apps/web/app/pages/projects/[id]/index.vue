<script setup lang="ts">
import type { HoverPayload } from '~/composables/useChartTooltip'
import type { ContributorMeta } from '~/composables/useContributorColors'
import type { DailyRow, Granularity } from '~/utils/d3Helpers'
import type { MonthlyRow } from '~/utils/monthDetailHelpers'
import HealthSummary from '~/components/HealthSummary.vue'
import MonthDetailPanel from '~/components/MonthDetailPanel.vue'
import ProjectLayout from '~/components/ProjectLayout.vue'
import Streamgraph from '~/components/Streamgraph.vue'
import StreamgraphTooltip from '~/components/StreamgraphTooltip.vue'
import { useChartTooltip } from '~/composables/useChartTooltip'
import { useContributorColors } from '~/composables/useContributorColors'
import { useProjectData } from '~/composables/useProjectData'
import { useProjectStats } from '~/composables/useProjectStats'
import { useStreamgraphData } from '~/composables/useStreamgraphData'
import { aggregateRows } from '~/utils/d3Helpers'
import { getAllContributors, getMonthContributors, getRangeContributors } from '~/utils/monthDetailHelpers'
import { yearToRange } from '~/utils/periodHelpers'
import { downloadStreamgraphSvg } from '~/utils/svgExport'

const route = useRoute()
const projectId = route.params.id as string

// -- Data lifecycle --
const {
  projectMeta,
  dailyData,
  monthlyData,
  healthSignals,
  selectedMonth,
  visibleRange,
  loading,
  error,
  isReady,
  isError,
  isProcessing,
  stageLabel,
  errorGuidance,
  availableMonths: _availableMonths,
  availableYears,
  handleReanalyze,
} = useProjectData(projectId)

// -- Stats --
const { stats, formattedDateRange, recentActivityLabel, recentActivityDotClass, formatNumber } = useProjectStats(dailyData as Ref<DailyRow[]>)

// -- Chart container (tooltip anchor) --
const graphContainerRef = ref<HTMLDivElement | null>(null)

// -- Tooltip --
const { tooltip, updateTooltip, hideTooltip } = useChartTooltip(graphContainerRef)

// -- Granularity --
const granularity = ref<Granularity>('month')

// -- Derived data --
const streamgraphData = computed(() => useStreamgraphData(dailyData.value as DailyRow[]).filteredRows)
const aggregatedData = computed(() => aggregateRows(streamgraphData.value, granularity.value))

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
const hasData = computed(() => (dailyData.value as DailyRow[]).length > 0)
const isAllHistory = computed(() => !selectedMonth.value)

// selectedMonth now stores year format "YYYY"
const selectedYearRange = computed(() => {
  if (!selectedMonth.value)
    return null
  return yearToRange(selectedMonth.value)
})

const panelContributors = computed(() => {
  if (visibleRange.value) {
    return getRangeContributors(dailyData.value as DailyRow[], visibleRange.value.start, visibleRange.value.end, colorMap.value)
  }
  if (!selectedMonth.value)
    return getAllContributors(monthlyData.value as MonthlyRow[], dailyData.value as DailyRow[], colorMap.value)
  if (selectedYearRange.value) {
    const { start, end } = selectedYearRange.value
    return getRangeContributors(dailyData.value as DailyRow[], start, end, colorMap.value)
  }
  return getMonthContributors(monthlyData.value as MonthlyRow[], dailyData.value as DailyRow[], selectedMonth.value!, colorMap.value)
})
const commitsThisMonth = computed(() => panelContributors.value.reduce((sum, c) => sum + c.monthlyCommits, 0))
const totalCommitsToDate = computed(() => panelContributors.value.reduce((sum, c) => sum + c.cumulativeCommits, 0))

const panelRangeLabel = computed(() => {
  if (visibleRange.value) {
    const { start, end } = visibleRange.value
    const startMonth = start.substring(0, 7)
    const endMonth = end.substring(0, 7)
    if (startMonth === endMonth)
      return undefined
    return `${start} ~ ${end}`
  }
  return undefined
})

const previousPeriodCommits = computed(() => {
  if (!selectedMonth.value)
    return 0
  const prevYear = String(Number(selectedMonth.value) - 1)
  const range = yearToRange(prevYear)
  return getRangeContributors(dailyData.value as DailyRow[], range.start, range.end, colorMap.value)
    .reduce((sum, c) => sum + c.monthlyCommits, 0)
})

const streamgraphRef = ref<{ getSvg: () => SVGSVGElement | null } | null>(null)
const reanalyzeDialogOpen = ref(false)

function formatRelativeTime(date: Date | null): string {
  if (!date)
    return ''
  const ms = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1)
    return 'just now'
  if (minutes < 60)
    return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30)
    return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12)
    return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

// -- Actions --
function handleExport() {
  const contributors = Array.from(new Set(streamgraphData.value.map((d: DailyRow) => d.contributor))).sort()
  const repoName = projectMeta.value?.fullName || projectMeta.value?.name || projectId
  downloadStreamgraphSvg(
    streamgraphRef.value?.getSvg?.() ?? null,
    `${repoName}-streamgraph.svg`,
    contributors,
    colorMap.value,
    {
      projectName: projectMeta.value?.fullName || projectMeta.value?.name || 'Project',
      dateRange: formattedDateRange.value,
      healthSignals: healthSignals.value.map(s => ({ label: s.label, severity: s.severity })),
    },
  )
}

function handleRangeChange(range: { start: string, end: string } | null) {
  visibleRange.value = range
}

function onHover(event: PointerEvent, payload: HoverPayload | null) {
  if (!payload) {
    hideTooltip()
    return
  }
  updateTooltip(event, payload)
}
</script>

<template>
  <div class="flex flex-col bg-slate-950 h-screen overflow">
    <div class="flex flex-col flex-1 px-6 lg:px-10 py-6 w-full">
      <!-- Loading -->
      <div
        v-if="loading"
        class="flex flex-col justify-center items-center py-24"
      >
        <div class="flex items-center gap-3 text-slate-400 text-sm">
          <span class="inline-block bg-sky-400 rounded-full w-2 h-2 animate-pulse" />
          {{ isProcessing ? stageLabel : 'Loading project...' }}
        </div>
      </div>

      <!-- Error: API failure -->
      <div
        v-else-if="error"
        class="flex flex-col justify-center items-center py-24"
      >
        <div class="bg-red-950/30 p-5 border border-red-800/60 rounded-md max-w-md text-center">
          <p class="font-medium text-red-300 text-sm">
            {{ error }}
          </p>
          <button
            class="mt-3 text-red-300 hover:text-red-200 text-xs underline underline-offset-2"
            @click="$router.push('/')"
          >
            Back to projects
          </button>
        </div>
      </div>

      <!-- Error: import/analysis failed -->
      <div
        v-else-if="isError"
        class="flex flex-col justify-center items-center py-24"
      >
        <div class="bg-red-950/30 p-5 border border-red-800/60 rounded-md max-w-md">
          <p class="font-medium text-red-300 text-sm">
            {{ errorGuidance?.title || 'Analysis failed' }}
          </p>
          <p
            v-if="errorGuidance?.hint"
            class="mt-1 text-red-400/80 text-xs"
          >
            {{ errorGuidance.hint }}
          </p>
          <div class="flex items-center gap-4 mt-4">
            <button
              class="text-red-300 hover:text-red-200 text-xs underline underline-offset-2"
              @click="reanalyzeDialogOpen = true"
            >
              Retry analysis
            </button>
            <button
              class="text-slate-400 hover:text-slate-200 text-xs underline underline-offset-2"
              @click="$router.push('/')"
            >
              Back to projects
            </button>
          </div>
        </div>
      </div>

      <!-- Empty: ready but no data -->
      <div
        v-else-if="isReady && (dailyData as DailyRow[]).length === 0"
        class="flex flex-col justify-center items-center py-24"
      >
        <h2 class="mb-2 font-medium text-slate-300 text-lg">
          No commit data available
        </h2>
        <p class="mb-4 text-slate-500 text-sm">
          The project was analyzed but no commits were found.
        </p>
        <div class="flex items-center gap-4">
          <button
            class="text-slate-300 hover:text-white text-xs underline underline-offset-2"
            @click="reanalyzeDialogOpen = true"
          >
            Re-analyze
          </button>
          <button
            class="text-slate-400 hover:text-slate-200 text-xs underline underline-offset-2"
            @click="$router.push('/')"
          >
            Back to projects
          </button>
        </div>
      </div>

      <!-- Main: data ready -->
      <template v-else-if="isReady && (dailyData as DailyRow[]).length > 0">
        <header class="mb-3 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="font-semibold text-slate-100 text-xl tracking-tight">
              {{ projectMeta?.fullName || projectMeta?.name || projectId }}
            </h1>
            <p
              v-if="projectMeta?.description"
              class="mt-1 text-slate-400 text-sm line-clamp-1"
            >
              {{ projectMeta.description }}
            </p>
          </div>
          <a
            v-if="projectMeta?.url"
            :href="projectMeta.url"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-md text-xs transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            GitHub
          </a>
        </header>

        <!-- Status bar -->
        <div class="flex flex-wrap items-center gap-4 mb-4 text-slate-400 text-xs">
          <span
            v-if="formattedDateRange"
            class="flex items-center gap-1.5"
          >
            <span class="text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            {{ formattedDateRange }}
          </span>
          <span v-if="formattedDateRange" class="text-slate-700">/</span>
          <span class="flex items-center gap-1.5">
            <span class="text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            {{ stats.totalContributors }} contributors
          </span>
          <span class="text-slate-700">/</span>
          <span class="flex items-center gap-1.5">
            <span class="text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" />
                <line x1="1.05" y1="12" x2="7" y2="12" />
                <line x1="17.01" y1="12" x2="22.96" y2="12" />
              </svg>
            </span>
            {{ formatNumber(stats.totalCommits) }} commits
          </span>
          <span class="text-slate-700">/</span>
          <span
            v-if="recentActivityLabel"
            class="flex items-center gap-1.5"
          >
            <span
              class="inline-block rounded-full w-1.5 h-1.5"
              :class="recentActivityDotClass"
            />
            {{ recentActivityLabel }}
          </span>
          <span v-if="recentActivityLabel" class="text-slate-700">/</span>
          <span
            v-if="projectMeta?.lastAnalyzedAt"
            class="flex items-center gap-1.5"
          >
            <span class="text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            Analyzed {{ formatRelativeTime(projectMeta.lastAnalyzedAt) }}
          </span>
        </div>

        <!-- Health signals -->
        <div
          v-if="healthSignals.length > 0"
          class="mb-3"
        >
          <HealthSummary :signals="healthSignals" />
        </div>

        <!-- Timeline controls -->
        <div class="flex items-center gap-2 bg-slate-900/50 mb-3 px-3 py-2 border border-slate-800 rounded-lg">
          <span class="mr-1 font-medium text-slate-500 text-xs select-none">Granularity</span>
          <div class="inline-flex bg-slate-800 p-0.5 rounded-md">
            <button
              v-for="g in (['day', 'week', 'month'] as Granularity[])"
              :key="g"
              class="px-2.5 py-1 rounded font-medium text-xs transition-all"
              :class="granularity === g ? 'bg-slate-600 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'"
              @click="granularity = g"
            >
              {{ g === 'day' ? 'Day' : g === 'week' ? 'Week' : 'Month' }}
            </button>
          </div>

          <span class="mx-1 text-slate-700 select-none">|</span>

          <MonthSelector
            v-model="selectedMonth"
            :months="availableYears"
          />

          <button
            class="hover:bg-slate-800 px-2.5 py-1 rounded text-slate-500 hover:text-slate-200 text-xs transition-colors"
            :class="{ 'text-slate-200 bg-slate-800': !selectedMonth }"
            @click="selectedMonth = null"
          >
            Reset
          </button>
        </div>

        <!-- Main chart -->
        <ProjectLayout class="flex-1 border border-slate-800 rounded-md min-h-0">
          <template #chart>
            <div
              ref="graphContainerRef"
              class="relative w-full h-full"
            >
              <Streamgraph
                ref="streamgraphRef"
                :data="aggregatedData"
                :selected-month="selectedMonth"
                :colors="colorMap"
                @update:selected-month="selectedMonth = $event"
                @range-change="handleRangeChange"
                @hover="onHover"
              />
              <StreamgraphTooltip
                :visible="tooltip.visible"
                :x="tooltip.x"
                :y="tooltip.y"
                :contributor="tooltip.contributor"
                :date="tooltip.date"
                :commits="tooltip.commits"
                :granularity="granularity"
                :lines-added="tooltip.linesAdded"
                :lines-deleted="tooltip.linesDeleted"
                :files-touched="tooltip.filesTouched"
                :percentage="tooltip.percentage"
                :total-commits="tooltip.totalCommits"
              />
            </div>
          </template>

          <template #panel>
            <MonthDetailPanel
              v-model:selected-month="selectedMonth"
              :available-months="availableYears"
              :contributors="panelContributors"
              :commits-this-month="commitsThisMonth"
              :total-commits-to-date="totalCommitsToDate"
              :has-data="hasData"
              :is-all-history="isAllHistory"
              :previous-month-commits="previousPeriodCommits"
              :range-label="panelRangeLabel"
              @export="handleExport"
            />
          </template>
        </ProjectLayout>
      </template>
    </div>

    <!-- Re-analyze confirmation -->
    <ConfirmDialog
      v-model:open="reanalyzeDialogOpen"
      title="Re-analyze project"
      :description="`This will re-clone and re-analyze ${projectMeta?.fullName || projectMeta?.name || 'this project'}. Existing data will be replaced.`"
      confirm-label="Re-analyze"
      confirm-color="warning"
      @confirm="handleReanalyze"
    />
  </div>
</template>
