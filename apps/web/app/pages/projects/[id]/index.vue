<script setup lang="ts">
import type { ContributorMeta } from '~/composables/useContributorColors'
import type { DailyRow } from '~/utils/d3Helpers'
import type { HealthSignal } from '~/utils/healthRules'
import type { MonthlyRow } from '~/utils/monthDetailHelpers'
import { useResizeObserver, useThrottleFn } from '@vueuse/core'
import HealthSummary from '~/components/HealthSummary.vue'
import MonthDetailPanel from '~/components/MonthDetailPanel.vue'
import ProjectLayout from '~/components/ProjectLayout.vue'
import Streamgraph from '~/components/Streamgraph.vue'
import StreamgraphTooltip from '~/components/StreamgraphTooltip.vue'
import { useContributorColors } from '~/composables/useContributorColors'
import { useStreamgraphData } from '~/composables/useStreamgraphData'
import { getAllContributors, getMonthContributors } from '~/utils/monthDetailHelpers'
import { downloadStreamgraphSvg } from '~/utils/svgExport'

interface ProjectMeta {
  id: number
  name: string
  path: string
  url: string | null
  fullName: string | null
  status: string
  description: string | null
  lastAnalyzedAt: Date | null
  errorMessage: string | null
  createdAt: Date
}

const route = useRoute()
const projectId = route.params.id as string

// -- Project metadata --
const projectMeta = ref<ProjectMeta | null>(null)
const metaLoading = ref(true)
const metaError = ref<string | null>(null)

// -- Chart data --
const dailyData = ref<DailyRow[]>([])
const monthlyData = ref<MonthlyRow[]>([])
const selectedMonth = ref<string | null>(null)
const dataLoading = ref(true)
const dataError = ref<string | null>(null)
const healthSignals = ref<HealthSignal[]>([])

// -- Derived: loading & error aggregates --
const loading = computed(() => metaLoading.value || dataLoading.value)
const error = computed(() => metaError.value || dataError.value)

// -- Project status --
const projectStatus = computed(() => projectMeta.value?.status ?? null)
const isReady = computed(() => projectStatus.value === 'ready')
const isError = computed(() => projectStatus.value === 'error')
const isProcessing = computed(() => projectStatus.value === 'cloning' || projectStatus.value === 'analyzing')

/** Human-readable stage label during cloning/analyzing */
const stageLabel = computed(() => {
  if (projectStatus.value === 'cloning')
    return 'Cloning repository...'
  if (projectStatus.value === 'analyzing')
    return 'Analyzing commits...'
  return ''
})

/** Error guidance based on error prefix */
const errorGuidance = computed(() => {
  const msg = projectMeta.value?.errorMessage
  if (!msg)
    return null
  if (msg.startsWith('GH_NOT_INSTALLED'))
    return { title: 'GitHub CLI not found', hint: 'Install gh CLI from cli.github.com and restart the server.' }
  if (msg.startsWith('GH_AUTH'))
    return { title: 'GitHub CLI not authenticated', hint: 'Run `gh auth login` in your terminal and restart the server.' }
  if (msg.startsWith('GH_NOT_FOUND'))
    return { title: 'Repository not found', hint: 'Check the URL. The repository may be private or deleted.' }
  if (msg.startsWith('GH_PRIVATE'))
    return { title: 'Private repository', hint: 'You don\'t have access to this repository. Ensure gh auth has the `repo` scope.' }
  if (msg.startsWith('CLONE_FAILED'))
    return { title: 'Clone failed', hint: msg.replace('CLONE_FAILED: ', '') }
  if (msg.startsWith('ANALYSIS_FAILED'))
    return { title: 'Analysis failed', hint: msg.replace('ANALYSIS_FAILED: ', '') }
  if (msg.startsWith('ANALYSIS_TIMEOUT'))
    return { title: 'Analysis timed out', hint: 'The repository may be too large. Try again or use a smaller repository.' }
  return { title: 'Error', hint: msg }
})

// -- Tooltip --
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
  percentage: 0,
})

// -- Chart sizing --
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

// -- Computed data --
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

// -- Statistics from daily data --
const statsFromData = computed(() => {
  if (dailyData.value.length === 0) {
    return { firstDate: null, lastDate: null, totalContributors: 0, totalCommits: 0, recentDaysSinceLastCommit: null }
  }

  const dates = dailyData.value.map(d => d.date).sort()
  const firstDate = dates[0]!
  const lastDate = dates[dates.length - 1]!

  const uniqueContributors = new Set(dailyData.value.map(d => d.contributor))
  const totalCommits = dailyData.value.reduce((sum, d) => sum + d.commits, 0)

  // Recent activity: days since last commit
  const lastDateMs = new Date(lastDate).getTime()
  const nowMs = Date.now()
  const daysSinceLastCommit = Math.floor((nowMs - lastDateMs) / (1000 * 60 * 60 * 24))

  return {
    firstDate,
    lastDate,
    totalContributors: uniqueContributors.size,
    totalCommits,
    recentDaysSinceLastCommit: daysSinceLastCommit,
  }
})

/** Formatted date range like "Jan 2023 — Mar 2026" */
const formattedDateRange = computed(() => {
  const { firstDate, lastDate } = statsFromData.value
  if (!firstDate || !lastDate)
    return null
  return `${formatShortDate(firstDate)} — ${formatShortDate(lastDate)}`
})

/** Recent activity indicator text */
const recentActivityLabel = computed(() => {
  const days = statsFromData.value.recentDaysSinceLastCommit
  if (days === null)
    return null
  if (days <= 1)
    return 'Active today'
  if (days <= 7)
    return `${days} days ago`
  if (days <= 30)
    return `${Math.round(days / 7)} weeks ago`
  if (days <= 365)
    return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
})

/** Recent activity dot color */
const recentActivityDotClass = computed(() => {
  const days = statsFromData.value.recentDaysSinceLastCommit
  if (days === null)
    return ''
  if (days <= 7)
    return 'bg-emerald-400'
  if (days <= 30)
    return 'bg-amber-400'
  return 'bg-slate-500'
})

const panelContributors = computed(() => {
  if (!selectedMonth.value)
    return getAllContributors(monthlyData.value, dailyData.value, colorMap.value)
  return getMonthContributors(monthlyData.value, dailyData.value, selectedMonth.value, colorMap.value)
})
const commitsThisMonth = computed(() => panelContributors.value.reduce((sum, c) => sum + c.monthlyCommits, 0))
const totalCommitsToDate = computed(() => panelContributors.value.reduce((sum, c) => sum + c.cumulativeCommits, 0))

// -- Resize observer --
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

// -- Data fetching --
onMounted(async () => {
  // Fetch project metadata first to determine status
  try {
    const meta = await $fetch<ProjectMeta>(`/api/projects/${projectId}`)
    projectMeta.value = meta
  }
  catch (err: any) {
    metaError.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Failed to load project.'
    metaLoading.value = false
    return
  }
  finally {
    metaLoading.value = false
  }

  // If project is not ready, skip chart data loading
  if (!isReady.value) {
    dataLoading.value = false
    // If still processing, poll for status changes
    if (isProcessing.value) {
      pollProjectStatus()
    }
    return
  }

  // Fetch chart data
  try {
    const [daily, monthly, health] = await Promise.all([
      $fetch<DailyRow[]>(`/api/projects/${projectId}/daily-aggregated`),
      $fetch<MonthlyRow[]>(`/api/projects/${projectId}/monthly`),
      $fetch<{ signals: HealthSignal[] }>(`/api/projects/${projectId}/health`),
    ])
    dailyData.value = daily
    monthlyData.value = monthly
    healthSignals.value = health.signals
    if (availableMonths.value.length > 0) {
      selectedMonth.value = availableMonths.value[availableMonths.value.length - 1] ?? null
    }
  }
  catch (err: any) {
    dataError.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Failed to load chart data.'
  }
  finally {
    dataLoading.value = false
  }
})

// -- Polling for import status --
let pollTimer: ReturnType<typeof setTimeout> | null = null

function pollProjectStatus() {
  if (pollTimer)
    clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    try {
      const meta = await $fetch<ProjectMeta>(`/api/projects/${projectId}`)
      projectMeta.value = meta

      if (meta.status === 'ready') {
        // Project became ready — load chart data
        dataLoading.value = true
        const [daily, monthly, health] = await Promise.all([
          $fetch<DailyRow[]>(`/api/projects/${projectId}/daily-aggregated`),
          $fetch<MonthlyRow[]>(`/api/projects/${projectId}/monthly`),
          $fetch<{ signals: HealthSignal[] }>(`/api/projects/${projectId}/health`),
        ])
        dailyData.value = daily
        monthlyData.value = monthly
        healthSignals.value = health.signals
        if (availableMonths.value.length > 0) {
          selectedMonth.value = availableMonths.value[availableMonths.value.length - 1] ?? null
        }
        dataLoading.value = false
      }
      else if (meta.status === 'error') {
        dataLoading.value = false
      }
      else {
        // Still processing — keep polling
        pollProjectStatus()
      }
    }
    catch {
      // Network error — stop polling
      dataLoading.value = false
    }
  }, 3000)
}

onUnmounted(() => {
  if (pollTimer)
    clearTimeout(pollTimer)
})

// -- Actions --
function handleExport() {
  const contributors = Array.from(new Set(streamgraphData.value.map((d: DailyRow) => d.contributor))).sort()
  const repoName = projectMeta.value?.fullName || projectMeta.value?.name || projectId
  downloadStreamgraphSvg(
    streamgraphRef.value?.getSvg?.() ?? null,
    `${repoName}-streamgraph.svg`,
    contributors,
    colorMap.value,
  )
}

async function handleReanalyze() {
  try {
    await $fetch(`/api/projects/${projectId}/reanalyze`, { method: 'POST' })
    // Start polling
    dataLoading.value = true
    dataError.value = null
    pollProjectStatus()
  }
  catch {
    // Silently handle — status will reflect on next poll
  }
}

function onHover(event: PointerEvent, payload: { contributor: string, date: string, commits: number, linesAdded: number, linesDeleted: number, filesTouched: number, percentage: number } | null) {
  if (!payload || !graphContainerRef.value) {
    tooltip.value.visible = false
    return
  }
  const rect = graphContainerRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

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
  tooltip.value.percentage = payload.percentage
}

// -- Helpers --
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatNumber(n: number): string {
  if (n >= 1000)
    return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex flex-col">
    <div class="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex flex-col flex-1 w-full">
      <!-- ============================================================ -->
      <!-- Loading: project metadata or chart data -->
      <!-- ============================================================ -->
      <div
        v-if="loading"
        class="flex flex-col items-center justify-center py-24"
      >
        <div class="flex items-center gap-3 text-sm text-slate-400">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
          {{ isProcessing ? stageLabel : 'Loading project...' }}
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- Error: project not found or API failure -->
      <!-- ============================================================ -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center py-24"
      >
        <div class="rounded-md border border-red-800/60 bg-red-950/30 p-5 max-w-md text-center">
          <p class="text-sm font-medium text-red-300">
            {{ error }}
          </p>
          <button
            class="mt-3 text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
            @click="$router.push('/')"
          >
            Back to projects
          </button>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- Error: project import/analysis failed -->
      <!-- ============================================================ -->
      <div
        v-else-if="isError"
        class="flex flex-col items-center justify-center py-24"
      >
        <div class="rounded-md border border-red-800/60 bg-red-950/30 p-5 max-w-md">
          <p class="text-sm font-medium text-red-300">
            {{ errorGuidance?.title || 'Analysis failed' }}
          </p>
          <p
            v-if="errorGuidance?.hint"
            class="mt-1 text-xs text-red-400/80"
          >
            {{ errorGuidance.hint }}
          </p>
          <div class="mt-4 flex items-center gap-4">
            <button
              class="text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
              @click="handleReanalyze"
            >
              Retry analysis
            </button>
            <button
              class="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200"
              @click="$router.push('/')"
            >
              Back to projects
            </button>
          </div>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- Empty: project is ready but has no data -->
      <!-- ============================================================ -->
      <div
        v-else-if="isReady && dailyData.length === 0 && !dataLoading"
        class="flex flex-col items-center justify-center py-24"
      >
        <h2 class="text-lg font-medium text-slate-300 mb-2">
          No commit data available
        </h2>
        <p class="text-sm text-slate-500 mb-4">
          The project was analyzed but no commits were found.
        </p>
        <div class="flex items-center gap-4">
          <button
            class="text-xs text-slate-300 underline underline-offset-2 hover:text-white"
            @click="handleReanalyze"
          >
            Re-analyze
          </button>
          <button
            class="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200"
            @click="$router.push('/')"
          >
            Back to projects
          </button>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- Main: project data ready -->
      <!-- ============================================================ -->
      <template v-else-if="isReady && dailyData.length > 0">
        <!-- ── Above the fold ── -->

        <!-- 1. Project identity -->
        <header class="mb-3">
          <h1 class="text-xl font-semibold text-slate-100 tracking-tight">
            {{ projectMeta?.fullName || projectMeta?.name || projectId }}
          </h1>
          <p
            v-if="projectMeta?.description"
            class="mt-1 text-sm text-slate-400 line-clamp-1"
          >
            {{ projectMeta.description }}
          </p>
        </header>

        <!-- 2. Status bar -->
        <div class="flex items-center gap-4 mb-4 text-xs text-slate-400 flex-wrap">
          <!-- Time range -->
          <span
            v-if="formattedDateRange"
            class="flex items-center gap-1.5"
          >
            <span class="text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect
                  x="3"
                  y="4"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                />
                <line
                  x1="16"
                  y1="2"
                  x2="16"
                  y2="6"
                />
                <line
                  x1="8"
                  y1="2"
                  x2="8"
                  y2="6"
                />
                <line
                  x1="3"
                  y1="10"
                  x2="21"
                  y2="10"
                />
              </svg>
            </span>
            {{ formattedDateRange }}
          </span>

          <!-- Separator -->
          <span
            v-if="formattedDateRange"
            class="text-slate-700"
          >/</span>

          <!-- Contributors -->
          <span class="flex items-center gap-1.5">
            <span class="text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle
                  cx="9"
                  cy="7"
                  r="4"
                />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            {{ statsFromData.totalContributors }} contributors
          </span>

          <!-- Separator -->
          <span class="text-slate-700">/</span>

          <!-- Total commits -->
          <span class="flex items-center gap-1.5">
            <span class="text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="4"
                />
                <line
                  x1="1.05"
                  y1="12"
                  x2="7"
                  y2="12"
                />
                <line
                  x1="17.01"
                  y1="12"
                  x2="22.96"
                  y2="12"
                />
              </svg>
            </span>
            {{ formatNumber(statsFromData.totalCommits) }} commits
          </span>

          <!-- Separator -->
          <span class="text-slate-700">/</span>

          <!-- Recent activity -->
          <span
            v-if="recentActivityLabel"
            class="flex items-center gap-1.5"
          >
            <span
              class="inline-block h-1.5 w-1.5 rounded-full"
              :class="recentActivityDotClass"
            />
            {{ recentActivityLabel }}
          </span>
        </div>

        <!-- 2.5 Health signals -->
        <div
          v-if="healthSignals.length > 0"
          class="mb-3"
        >
          <HealthSummary :signals="healthSignals" />
        </div>

        <!-- 4. Timeline controls -->
        <div class="flex items-center gap-3 mb-3">
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

        <!-- 3. Main chart — dominant visual element -->
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
                :percentage="tooltip.percentage"
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
      </template>
    </div>
  </div>
</template>
