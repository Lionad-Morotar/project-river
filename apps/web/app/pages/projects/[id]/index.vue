<script setup lang="ts">
import type { HoverPayload } from '~/composables/useChartTooltip'
import type { ContributorMeta } from '~/composables/useContributorColors'
import type { ProjectEvent } from '~/composables/useProjectEvents'
import type { DailyRow, Granularity } from '~/utils/d3Helpers'
import EventGroupSelector from '~/components/EventGroupSelector.vue'
import EventMarkerTooltip from '~/components/EventMarkerTooltip.vue'
import HealthSummary from '~/components/HealthSummary.vue'
import MonthDetailPanel from '~/components/MonthDetailPanel.vue'
import ProjectEventsPanel from '~/components/ProjectEventsPanel.vue'
import ProjectLayout from '~/components/ProjectLayout.vue'
import ResizeHandle from '~/components/ResizeHandle.vue'
import Streamgraph from '~/components/Streamgraph.vue'
import StreamgraphTooltip from '~/components/StreamgraphTooltip.vue'
import { useAppSettings } from '~/composables/useAppSettings'
import { useChartTooltip } from '~/composables/useChartTooltip'
import { useContributorColors } from '~/composables/useContributorColors'
import { useProjectData } from '~/composables/useProjectData'
import { useProjectEvents } from '~/composables/useProjectEvents'
import { useProjectStats } from '~/composables/useProjectStats'
import { getAllProjectMeta, useStaticData } from '~/composables/useStaticData'
import { applyTopN, TOP_N_MAX, useStreamgraphData } from '~/composables/useStreamgraphData'
import { aggregateRows, toWeekKey } from '~/utils/d3Helpers'
import { getAllContributorsFromDaily, getMonthContributorsFromDaily, getRangeContributors } from '~/utils/monthDetailHelpers'
import { yearToRange } from '~/utils/periodHelpers'
import { downloadStreamgraphSvg } from '~/utils/svgExport'

const config = useRuntimeConfig()
const isStatic = config.public.staticMode === true

// -- Static data (for project selector) --
const { bundle: staticBundle } = useStaticData()

const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()
const { monthNames, formatRelativeTime } = useLocale()
const route = useRoute()
const projectId = route.params.id as string

// -- App settings (theme, local save) --
const { activeTheme } = useAppSettings()
const settingsModalOpen = ref(false)

function toggleTheme() {
  const newPref = colorMode.value === 'dark' ? 'light' : 'dark'

  if (!document.startViewTransition) {
    colorMode.preference = newPref
    return
  }

  document.documentElement.dataset.themeTransition = ''
  const transition = document.startViewTransition(async () => {
    colorMode.preference = newPref
    await nextTick()
  })
  transition.finished.then(() => {
    delete document.documentElement.dataset.themeTransition
  })
}

function toggleLocale() {
  const newLocale = locale.value === 'zh-CN' ? 'en' : 'zh-CN'

  if (!document.startViewTransition) {
    setLocale(newLocale)
    return
  }

  document.documentElement.dataset.themeTransition = ''
  const transition = document.startViewTransition(async () => {
    await setLocale(newLocale)
    await nextTick()
  })
  transition.finished.then(() => {
    delete document.documentElement.dataset.themeTransition
  })
}

// -- Data lifecycle --
const {
  projectMeta,
  dailyData,
  _monthlyData,
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
const { stats, formattedDateRange, recentActivityLabel, recentActivityDotClass } = useProjectStats(dailyData as Ref<DailyRow[]>, projectMeta)

// -- Project selector (ghost dropdown) --
const projectSelectorOpen = ref(false)

// API 模式下从数据库获取项目列表（static 模式不发起请求）
const { data: apiProjectList } = useFetch<{ id: number, name: string, fullName: string | null }[]>('/api/projects', {
  server: false,
  immediate: !isStatic,
})

/** 从 fullName 提取显示名称，local: 前缀项目只显示 name */
function displayLabel(fullName: string | null, name: string) {
  if (fullName?.startsWith('local:'))
    return name
  return fullName || name
}

const otherProjects = computed(() => {
  const currentId = Number(projectId)

  if (isStatic && staticBundle.value) {
    return getAllProjectMeta(staticBundle.value)
      .filter(p => p.id !== currentId)
      .map(p => ({ id: p.id, label: displayLabel(p.fullName, p.name) }))
  }

  if (!isStatic && apiProjectList.value) {
    return apiProjectList.value
      .filter(p => p.id !== currentId)
      .map(p => ({ id: p.id, label: displayLabel(p.fullName, p.name) }))
  }

  return []
})

function selectOtherProject(id: number) {
  projectSelectorOpen.value = false
  navigateTo(`/projects/${id}`)
}

const addNewProjectUrl = computed(() => {
  if (isStatic)
    return 'https://github.com/Lionad-Morotar/project-river?tab=readme-ov-file#%E5%A6%82%E4%BD%95%E8%BF%90%E8%A1%8C'
  return '/'
})

// -- Project events --
const {
  events: projectEvents,
  loading: eventsLoading,
  getEventsInRange,
  groups: eventGroups,
  selectedGroupIds: selectedEventGroups,
  expandedGroupIds: expandedEventGroups,
  toggleGroup: toggleEventGroup,
  toggleExpanded: toggleEventExpanded,
  markerEvents,
} = useProjectEvents(dailyData as Ref<DailyRow[]>)

// -- Chart container (tooltip anchor) --
const graphContainerRef = ref<HTMLDivElement | null>(null)

// -- Tooltip --
const { tooltip, updateTooltip, hideTooltip } = useChartTooltip(graphContainerRef)

// -- Granularity --
const granularity = ref<Granularity>('month')

// -- Top-N contributor count --
const topN = ref(10) // will be overridden by autoDefaultTopN
const topNOptions = [5, 15, 25, 35] as const
const topNSelectOpen = ref(false)
const topNCustomMode = ref(false)
const topNCustomInput = ref('')
const topMax = TOP_N_MAX

function selectTopN(n: number) {
  topN.value = Math.max(1, Math.min(topMax, n))
  topNSelectOpen.value = false
  topNCustomMode.value = false
}

function applyCustomTopN() {
  const v = Number.parseInt(topNCustomInput.value, 10)
  if (!Number.isFinite(v) || v <= 0)
    return
  topN.value = Math.max(1, Math.min(topMax, v))
  topNSelectOpen.value = false
}

// -- Derived data --
const streamgraphData = computed(() => useStreamgraphData(dailyData.value as DailyRow[]).filteredRows)

// Auto-calculate default topN: keep adding top contributors until ≥95% of total commits
const autoDefaultTopN = computed(() => {
  const rows = streamgraphData.value
  if (rows.length === 0)
    return 10
  const totals = new Map<string, number>()
  let grandTotal = 0
  for (const r of rows) {
    totals.set(r.contributor, (totals.get(r.contributor) || 0) + r.commits)
    grandTotal += r.commits
  }
  if (grandTotal === 0)
    return 10
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const threshold = grandTotal * 0.95
  let cumulative = 0
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i]![1]
    if (cumulative >= threshold)
      return Math.max(1, Math.min(topMax - 1, i + 1))
  }
  return Math.min(topMax - 1, sorted.length)
})
watch(autoDefaultTopN, (n) => {
  topN.value = n
}, { immediate: true })

const topNData = computed(() => applyTopN(streamgraphData.value, topN.value))
const aggregatedData = computed(() => aggregateRows(topNData.value, granularity.value))

const contributorMetaList = computed<ContributorMeta[]>(() => {
  const firstDateMap = new Map<string, string>()
  const totalMap = new Map<string, number>()
  for (const row of topNData.value) {
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

const colorMap = computed(() => {
  const { baseHue, spread: hueSpread } = activeTheme.value
  return useContributorColors(contributorMetaList.value, colorMode.value === 'dark', baseHue, hueSpread)
})
const hasData = computed(() => (dailyData.value as DailyRow[]).length > 0)
const isAllHistory = computed(() => !selectedMonth.value)

// selectedMonth now stores year format "YYYY"
const selectedYearRange = computed(() => {
  if (!selectedMonth.value)
    return null
  return yearToRange(selectedMonth.value)
})

// -- Debounced range for panel (expensive computations) --
const panelRange = ref<{ start: string, end: string } | null>(null)
let panelRangeTimer: ReturnType<typeof setTimeout> | null = null

watch(visibleRange, (newVal) => {
  if (panelRangeTimer)
    clearTimeout(panelRangeTimer)
  panelRangeTimer = setTimeout(() => {
    panelRange.value = newVal ? { ...newVal } : null
  }, 150)
}, { immediate: true })

const panelContributors = computed(() => {
  // Use topNData so "Other contributors" aggregation is reflected in panel stats
  const topNRows = topNData.value
  if (panelRange.value) {
    return getRangeContributors(topNRows, panelRange.value.start, panelRange.value.end, colorMap.value)
  }
  if (!selectedMonth.value)
    return getAllContributorsFromDaily(topNRows, colorMap.value)
  if (selectedYearRange.value) {
    const { start, end } = selectedYearRange.value
    return getRangeContributors(topNRows, start, end, colorMap.value)
  }
  return getMonthContributorsFromDaily(topNRows, selectedMonth.value!, colorMap.value)
})
const commitsThisMonth = computed(() => panelContributors.value.reduce((sum, c) => sum + c.monthlyCommits, 0))
const totalCommitsToDate = computed(() => panelContributors.value.reduce((sum, c) => sum + c.cumulativeCommits, 0))

// Active days: unique dates with commits within the current panel range
const panelActiveDays = computed(() => {
  const rows = topNData.value
  let start: string, end: string

  if (panelRange.value) {
    start = panelRange.value.start
    end = panelRange.value.end
  }
  else if (!selectedMonth.value) {
    // all history
    const dates = new Set(rows.map(r => r.date))
    if (dates.size === 0)
      return { active: 0, total: 0 }
    const sorted = Array.from(dates).sort()
    start = sorted[0]!
    end = sorted[sorted.length - 1]!
  }
  else if (selectedYearRange.value) {
    start = selectedYearRange.value.start
    end = selectedYearRange.value.end
  }
  else {
    const r = yearToRange(selectedMonth.value!)
    start = r.start
    end = r.end
  }

  const dates = new Set<string>()
  for (const row of rows) {
    if (row.date >= start && row.date <= end) {
      dates.add(row.date)
    }
  }
  const total = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
  return { active: dates.size, total }
})

const panelRangeLabel = computed(() => {
  if (panelRange.value) {
    const { start, end } = panelRange.value
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
  return getRangeContributors(topNData.value, range.start, range.end, colorMap.value)
    .reduce((sum, c) => sum + c.monthlyCommits, 0)
})

const streamgraphRef = ref<{ getSvg: () => SVGSVGElement | null, highlightContributor: (name: string | null) => void, highlightEventMarker: (id: string | null) => void } | null>(null)

// -- Panel split: EventsPanel height (px), MonthDetailPanel takes remaining --
const eventsPanelH = ref(200)

function onPanelSplitResize(delta: number) {
  eventsPanelH.value = Math.max(80, eventsPanelH.value + delta)
}
const reanalyzeDialogOpen = ref(false)
const deleteDialogOpen = ref(false)

// -- Actions --
async function handleDelete() {
  try {
    await $fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    // Navigate back to home after deletion
    navigateTo('/')
  }
  catch {
    // Silently fail, user can retry
  }
}
function handleExport() {
  const contributors = Array.from(new Set(topNData.value.map((d: DailyRow) => d.contributor))).sort()
  const repoName = projectMeta.value?.fullName || projectMeta.value?.name || projectId
  downloadStreamgraphSvg(
    streamgraphRef.value?.getSvg?.() ?? null,
    `${repoName}-streamgraph.svg`,
    contributors,
    colorMap.value,
    {
      projectName: projectMeta.value?.fullName || projectMeta.value?.name || 'Project',
      dateRange: formattedDateRange.value,
      healthSignals: healthSignals.value.map(s => ({ label: t(s.label), severity: s.severity })),
      localeStrings: {
        more: t('export.more'),
      },
    },
  )
}

// -- Panel → Chart cross-highlight --
function handleHoverContributor(name: string | null) {
  streamgraphRef.value?.highlightContributor?.(name)
}

function handleHoverEvent(event: ProjectEvent | null) {
  streamgraphRef.value?.highlightEventMarker?.(event?.id ?? null)
}

function handleRangeChange(range: { start: string, end: string } | null) {
  visibleRange.value = range
}

onUnmounted(() => {
  if (panelRangeTimer) {
    clearTimeout(panelRangeTimer)
    panelRangeTimer = null
  }
})

function onHover(event: PointerEvent, payload: HoverPayload | null) {
  if (!payload) {
    hideTooltip()
    return
  }
  updateTooltip(event, payload)
}

// -- Project Events --
const visibleEvents = computed(() => {
  if (panelRange.value) {
    return getEventsInRange(panelRange.value.start, panelRange.value.end)
  }
  if (selectedYearRange.value) {
    return getEventsInRange(selectedYearRange.value.start, selectedYearRange.value.end)
  }
  return projectEvents.value
})

// -- Event group counts for selector --
// Total events per type (before truncation)
const eventTypeTotalCounts = computed(() => {
  const map = new Map<string, number>()
  for (const e of projectEvents.value) {
    map.set(e.type, (map.get(e.type) || 0) + 1)
  }
  return map
})

// Shown events per type (after truncation)
const eventTypeCounts = computed(() => {
  const map = new Map<string, number>()
  for (const e of markerEvents.value) {
    map.set(e.type, (map.get(e.type) || 0) + 1)
  }
  return map
})

// All events as chart markers — selected ones visible, rest hidden but available for panel hover
// Snap dates to match current granularity so markers stay within the clip rect
const allEventMarkers = computed(() => {
  const selectedIds = new Set(markerEvents.value.map(e => e.id))
  const g = granularity.value
  const snapDate = (d: string): string => {
    if (g === 'month')
      return `${d.substring(0, 7)}-01`
    if (g === 'week')
      return toWeekKey(d)
    return d
  }
  return projectEvents.value
    .map(e => ({
      id: e.id,
      date: snapDate(e.date),
      priority: e.priority,
      severity: e.severity,
      selected: selectedIds.has(e.id),
    }))
})

function handleToggleEventGroup(id: string, checked: boolean) {
  toggleEventGroup(id, checked)
}

function handleToggleExpanded(id: string) {
  toggleEventExpanded(id)
}

// -- Event marker tooltip --
const markerTooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  event: null as ProjectEvent | null,
})

function onMarkerHover(pointerEvent: PointerEvent, marker: { id: string } | null) {
  if (!marker) {
    markerTooltip.visible = false
    markerTooltip.event = null
    return
  }
  const event = projectEvents.value.find(e => e.id === marker.id) || null
  markerTooltip.event = event
  // Prevent right overflow: if tooltip would exceed viewport, position to the left
  const estimatedWidth = 280
  const x = pointerEvent.clientX + 12
  markerTooltip.x = x + estimatedWidth > window.innerWidth ? pointerEvent.clientX - estimatedWidth - 8 : x
  markerTooltip.y = pointerEvent.clientY - 12
  markerTooltip.visible = true
}
</script>

<template>
  <div class="flex flex-col bg-default h-screen overflow-hidden">
    <div class="flex flex-col flex-1 px-6 lg:px-10 py-6 w-full min-h-0 overflow-hidden">
      <!-- Loading -->
      <div
        v-if="loading"
        class="flex flex-col justify-center items-center py-24"
      >
        <div class="flex items-center gap-3 text-dimmed text-sm">
          <span class="inline-block bg-sky-400 rounded-full w-2 h-2 animate-pulse" />
          {{ isProcessing ? stageLabel : $t('project.loadingProject') }}
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
            {{ $t('common.backToProjects') }}
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
            {{ errorGuidance?.title ? $t(errorGuidance.title) : $t('import.failed') }}
          </p>
          <p
            v-if="errorGuidance?.hint"
            class="mt-1 text-red-400/80 text-xs"
          >
            {{ errorGuidance.hintParams ? $t(errorGuidance.hint, errorGuidance.hintParams) : $t(errorGuidance.hint) }}
          </p>
          <div class="flex items-center gap-4 mt-4">
            <button
              v-if="!isStatic"
              class="text-red-300 hover:text-red-200 text-xs underline underline-offset-2"
              @click="reanalyzeDialogOpen = true"
            >
              {{ $t('common.retry') }}
            </button>
            <button
              class="text-dimmed hover:text-default text-xs underline underline-offset-2"
              @click="$router.push('/')"
            >
              {{ $t('common.backToProjects') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Empty: ready but no data -->
      <div
        v-else-if="isReady && (dailyData as DailyRow[]).length === 0"
        class="flex flex-col justify-center items-center py-24"
      >
        <h2 class="mb-2 font-medium text-default text-lg">
          {{ $t('project.noCommitData') }}
        </h2>
        <p class="mb-4 text-muted text-sm">
          {{ $t('project.noCommitDataHint') }}
        </p>
        <div class="flex items-center gap-4">
          <button
            v-if="!isStatic"
            class="text-default hover:text-highlighted text-xs underline underline-offset-2"
            @click="reanalyzeDialogOpen = true"
          >
            {{ $t('project.reAnalyze') }}
          </button>
          <button
            class="text-dimmed hover:text-default text-xs underline underline-offset-2"
            @click="$router.push('/')"
          >
            {{ $t('common.backToProjects') }}
          </button>
        </div>
      </div>

      <!-- Main: data ready -->
      <template v-else-if="isReady && (dailyData as DailyRow[]).length > 0">
        <header class="flex justify-between items-start gap-4 mb-3">
          <div class="flex-1 min-w-0">
            <!-- Project selector: ghost dropdown to switch projects or add new -->
            <div class="flex items-center gap-2">
              <div class="relative">
                <button
                  class="flex items-center gap-1.5 hover:bg-elevated/60 -ml-2 px-2.5 py-1 rounded-md text-highlighted transition-colors"
                  @click="projectSelectorOpen = !projectSelectorOpen"
                >
                  <h1 class="m-0 p-0 font-semibold text-3xl tracking-tight">
                    {{ displayLabel(projectMeta?.fullName ?? null, projectMeta?.name ?? String(projectId)) }}
                  </h1>
                  <svg xmlns="http://www.w3.org/2000/svg" class="mt-1 w-3.5 h-3.5 text-muted transition-transform duration-150" :class="projectSelectorOpen ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <Transition
                  enter-active-class="transition-all duration-150 ease-out"
                  enter-from-class="opacity-0 -translate-y-1"
                  enter-to-class="opacity-100 translate-y-0"
                  leave-active-class="transition-all duration-100 ease-in"
                  leave-from-class="opacity-100 translate-y-0"
                  leave-to-class="opacity-0 -translate-y-1"
                >
                  <div
                    v-if="projectSelectorOpen"
                    class="top-full left-0 z-50 absolute bg-elevated shadow-lg mt-1.5 py-1 border border-default rounded-lg w-56"
                  >
                    <!-- Other projects -->
                    <button
                      v-for="p in otherProjects"
                      :key="p.id"
                      class="hover:bg-elevated/60 px-3 py-1.5 w-full text-dimmed hover:text-default text-xs text-left transition-colors"
                      @click="selectOtherProject(p.id)"
                    >
                      {{ p.label }}
                    </button>
                    <div v-if="otherProjects.length > 0" class="my-1 border-default border-t" />
                    <!-- Add new project -->
                    <a
                      :href="addNewProjectUrl"
                      :target="isStatic ? '_blank' : undefined"
                      rel="noopener noreferrer"
                      class="flex items-center gap-2 hover:bg-elevated/60 px-3 py-1.5 text-accented hover:text-default text-xs transition-colors"
                      @click="projectSelectorOpen = false"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      {{ isStatic ? $t('project.addNewProject') : $t('project.importProject') }}
                    </a>
                  </div>
                </Transition>
                <!-- Backdrop -->
                <div
                  v-if="projectSelectorOpen"
                  class="z-40 fixed inset-0"
                  @click="projectSelectorOpen = false"
                />
              </div>
            </div>
            <p
              v-if="projectMeta?.description"
              class="mt-1 text-dimmed text-sm line-clamp-1"
            >
              {{ projectMeta.description }}
            </p>
          </div>

          <!-- Theme & locale toggles -->
          <div class="flex items-center gap-1 shrink-0">
            <a
              href="https://github.com/Lionad-Morotar/project-river"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
              aria-label="GitHub"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <NuxtLink
              to="/"
              class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
              :aria-label="t('common.home')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </NuxtLink>
            <button
              class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
              :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
              @click="toggleTheme"
            >
              <svg
                v-if="colorMode.value === 'dark'"
                xmlns="http://www.w3.org/2000/svg"
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
            <button
              class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
              :aria-label="locale === 'zh-CN' ? 'Switch to English' : '切换为中文'"
              @click="toggleLocale"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m5 8 6 6" />
                <path d="m4 14 6-6 2-3" />
                <path d="M2 5h12" />
                <path d="M7 2h1" />
                <path d="m22 22-5-10-5 10" />
                <path d="M14 18h6" />
              </svg>
            </button>
            <button
              class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
              :aria-label="t('settings.title')"
              @click="settingsModalOpen = true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Status bar -->
        <div class="flex flex-wrap items-center gap-4 mb-4 text-dimmed text-xs">
          <span
            v-if="formattedDateRange"
            class="flex items-center gap-1.5"
          >
            <span class="text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            {{ formattedDateRange }}
          </span>
          <span v-if="formattedDateRange" class="text-muted/40">/</span>
          <span class="flex items-center gap-1.5">
            <span class="text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            {{ $t('project.contributors', { count: stats.totalContributors }) }}
          </span>
          <span class="text-muted/40">/</span>
          <span class="flex items-center gap-1.5">
            <span class="text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" />
                <line x1="1.05" y1="12" x2="7" y2="12" />
                <line x1="17.01" y1="12" x2="22.96" y2="12" />
              </svg>
            </span>
            {{ $t('project.commits', { count: stats.totalCommits }) }}
          </span>
          <span class="text-muted/40">/</span>
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
          <span v-if="recentActivityLabel" class="text-muted/40">/</span>
          <span
            v-if="projectMeta?.lastAnalyzedAt"
            class="flex items-center gap-1.5"
          >
            <span class="text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            {{ $t('project.analyzed', { time: formatRelativeTime(projectMeta.lastAnalyzedAt) }) }}
          </span>

          <div class="flex flex-wrap items-center self-end gap-4 ml-auto text-dimmed text-xs">
            <!-- GitHub link -->
            <a
              v-if="projectMeta?.url"
              :href="projectMeta.url"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1.5 text-dimmed hover:text-default transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              GitHub
            </a>

            <!-- Project actions: re-analyze + delete (non-static only) -->
            <template v-if="!isStatic">
              <span class="text-muted/40">/</span>
              <button
                class="flex items-center gap-1.5 text-dimmed hover:text-default transition-colors"
                @click="reanalyzeDialogOpen = true"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {{ $t('project.reAnalyze') }}
              </button>
              <span class="text-muted/40">/</span>
              <button
                class="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors"
                @click="deleteDialogOpen = true"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {{ $t('common.delete') }}
              </button>
            </template>
          </div>
        </div>

        <!-- Health signals -->
        <div
          v-if="healthSignals.length > 0"
          class="mb-3"
        >
          <HealthSummary :signals="healthSignals" />
        </div>

        <!-- Timeline controls -->
        <div class="flex justify-between items-center mb-3 px-1">
          <!-- Left: Top-N + EventGroupSelector -->
          <div class="flex items-center gap-1">
            <!-- Top-N contributor selector -->
            <div class="relative">
              <button
                class="flex items-center gap-1 hover:bg-elevated/60 px-2 py-1 rounded-md font-medium text-dimmed hover:text-default text-xs transition-colors"
                :class="topNSelectOpen ? 'text-default bg-elevated/40' : ''"
                @click="topNSelectOpen = !topNSelectOpen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <template v-if="topN === 5">
                  Top 5 contributors
                </template>
                <template v-else>
                  {{ $t('topN.label', { n: topN }) }}
                </template>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 transition-transform duration-150" :class="topNSelectOpen ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <Transition
                enter-active-class="transition-all duration-150 ease-out"
                enter-from-class="opacity-0 -translate-y-1"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-100 ease-in"
                leave-from-class="opacity-100 translate-y-0"
                leave-to-class="opacity-0 -translate-y-1"
              >
                <div
                  v-if="topNSelectOpen"
                  class="top-full left-0 z-50 absolute bg-elevated shadow-lg mt-1.5 py-1 border border-default rounded-lg w-36"
                >
                  <button
                    v-for="opt in topNOptions"
                    :key="opt"
                    class="px-3 py-1.5 w-full text-xs text-left transition-colors"
                    :class="topN === opt ? 'text-default bg-accented/20' : 'text-dimmed hover:text-default hover:bg-accented/10'"
                    @click="selectTopN(opt)"
                  >
                    <template v-if="opt === 5">
                      Top 5 contributors
                    </template>
                    <template v-else>
                      Top {{ opt }}
                    </template>
                  </button>
                  <div class="my-1 border-default border-t" />
                  <div class="px-3 py-1">
                    <div class="flex justify-between items-center gap-1.5">
                      <input
                        v-model="topNCustomInput"
                        type="number"
                        min="1"
                        :max="topMax - 1"
                        class="flex-1 px-1.5 py-1 border border-default rounded focus:outline-none focus:ring-1 focus:ring-accented w-14 tabular-nums text-default text-xs g-default"
                        :placeholder="$t('topN.custom')"
                        @keyup.enter="applyCustomTopN()"
                        @click.stop
                      >
                      <button
                        class="hover:bg-accented/10 px-2 py-1 rounded text-muted hover:text-default text-xs transition-colors"
                        @click="applyCustomTopN()"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <EventGroupSelector
              :groups="eventGroups"
              :selected-ids="selectedEventGroups"
              :expanded-ids="expandedEventGroups"
              :counts="eventTypeCounts"
              :total-counts="eventTypeTotalCounts"
              @toggle="handleToggleEventGroup"
              @toggle-expanded="handleToggleExpanded"
            />
          </div>

          <!-- Right: Granularity + MonthSelector -->
          <div class="flex items-center gap-1">
            <MonthSelector
              v-model="selectedMonth"
              :months="availableYears"
            />
            <div class="inline-flex bg-elevated/30 p-0.5 rounded-md">
              <button
                v-for="g in (['day', 'week', 'month'] as Granularity[])"
                :key="g"
                class="px-2.5 py-1 rounded font-medium text-xs transition-all"
                :class="granularity === g ? 'bg-accented/40 text-highlighted shadow-sm' : 'text-dimmed hover:text-default'"
                @click="granularity = g"
              >
                {{ g === 'day' ? $t('granularity.day') : g === 'week' ? $t('granularity.week') : $t('granularity.month') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Main chart -->
        <ProjectLayout class="flex-1 border border-default rounded-md min-h-0">
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
                :month-names="monthNames"
                :event-markers="allEventMarkers"
                :brush-smoothness="1"
                @update:selected-month="selectedMonth = $event"
                @range-change="handleRangeChange"
                @hover="onHover"
                @marker-hover="onMarkerHover"
              />
              <EventMarkerTooltip
                :visible="markerTooltip.visible"
                :x="markerTooltip.x"
                :y="markerTooltip.y"
                :event="markerTooltip.event"
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
            <div class="flex flex-col h-full">
              <div
                class="min-h-0 overflow-hidden"
                :style="{ height: `${eventsPanelH}px` }"
              >
                <ProjectEventsPanel
                  :events="visibleEvents"
                  :total-events="projectEvents.length"
                  :loading="eventsLoading"
                  :visible-range="visibleRange"
                  @hover-event="handleHoverEvent"
                />
              </div>
              <ResizeHandle
                orientation="horizontal"
                @move="onPanelSplitResize"
              />
              <div class="flex-1 min-h-0 overflow-hidden">
                <MonthDetailPanel
                  v-model:selected-month="selectedMonth"
                  :available-months="availableYears"
                  :contributors="panelContributors"
                  :commits-this-month="commitsThisMonth"
                  :total-commits-to-date="totalCommitsToDate"
                  :active-days="panelActiveDays.active"
                  :total-days="panelActiveDays.total"
                  :has-data="hasData"
                  :is-all-history="isAllHistory"
                  :previous-month-commits="previousPeriodCommits"
                  :range-label="panelRangeLabel"
                  @export="handleExport"
                  @hover-contributor="handleHoverContributor"
                />
              </div>
            </div>
          </template>
        </ProjectLayout>
      </template>
    </div>

    <!-- Re-analyze confirmation (hidden in static mode) -->
    <ConfirmDialog
      v-if="!isStatic"
      v-model:open="reanalyzeDialogOpen"
      :title="$t('dialog.reanalyzeTitle')"
      :description="$t('dialog.reanalyzeDescription', { name: projectMeta?.fullName || projectMeta?.name || $t('project.thisProject') })"
      :confirm-label="$t('common.reanalyze')"
      confirm-color="warning"
      @confirm="handleReanalyze"
    />

    <!-- Delete confirmation (hidden in static mode) -->
    <ConfirmDialog
      v-if="!isStatic"
      v-model:open="deleteDialogOpen"
      :title="$t('dialog.deleteTitle')"
      :description="$t('dialog.deleteDescription', { name: projectMeta?.fullName || projectMeta?.name || $t('project.thisProject') })"
      :confirm-label="$t('common.delete')"
      confirm-color="danger"
      @confirm="handleDelete"
    />

    <!-- Settings modal -->
    <SettingsModal v-model:open="settingsModalOpen" show-storage />
  </div>
</template>
