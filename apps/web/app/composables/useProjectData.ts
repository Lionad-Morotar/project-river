import type { DailyRow } from '~/utils/d3Helpers'
import type { HealthSignal } from '~/utils/healthRules'
import type { MonthlyRow } from '~/utils/monthDetailHelpers'
import { useIntervalFn } from '@vueuse/core'
import { getErrorGuidance } from '~/utils/errorGuidance'
import { generateYears } from '~/utils/periodHelpers'

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

const POLL_INTERVAL_MS = 3000

export function useProjectData(projectId: string) {
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
  const visibleRange = ref<{ start: string, end: string } | null>(null)

  // -- Derived: loading & error aggregates --
  const loading = computed(() => metaLoading.value || dataLoading.value)
  const error = computed(() => metaError.value || dataError.value)

  // -- Project status --
  const projectStatus = computed(() => projectMeta.value?.status ?? null)
  const isReady = computed(() => projectStatus.value === 'ready')
  const isError = computed(() => projectStatus.value === 'error')
  const isProcessing = computed(() => projectStatus.value === 'cloning' || projectStatus.value === 'analyzing')

  const stageLabel = computed(() => {
    if (projectStatus.value === 'cloning')
      return 'Cloning repository...'
    if (projectStatus.value === 'analyzing')
      return 'Analyzing commits...'
    return ''
  })

  const errorGuidance = computed(() => getErrorGuidance(projectMeta.value?.errorMessage))

  // -- 派生数据 --
  const availableMonths = computed(() =>
    Array.from(new Set(monthlyData.value.map(m => m.yearMonth))).sort(),
  )
  const availableYears = computed(() => generateYears(availableMonths.value))

  // -- 数据获取 --
  async function fetchChartData() {
    dataLoading.value = true
    try {
      const [daily, monthly, health] = await Promise.all([
        $fetch<DailyRow[]>(`/api/projects/${projectId}/daily-aggregated`),
        $fetch<MonthlyRow[]>(`/api/projects/${projectId}/monthly`),
        $fetch<{ signals: HealthSignal[] }>(`/api/projects/${projectId}/health`),
      ])
      dailyData.value = daily
      monthlyData.value = monthly
      healthSignals.value = health.signals
    }
    catch (err: any) {
      dataError.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Failed to load chart data.'
    }
    finally {
      dataLoading.value = false
    }
  }

  /* eslint-disable ts/no-use-before-define */
  async function fetchProjectData() {
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

    if (!isReady.value) {
      dataLoading.value = false
      if (isProcessing.value) {
        resumePolling()
      }
      return
    }

    await fetchChartData()
  }
  /* eslint-enable ts/no-use-before-define */

  // -- 轮询逻辑 --
  let pausePolling: () => void
  let resumePolling: () => void

  async function pollCallback() {
    try {
      const meta = await $fetch<ProjectMeta>(`/api/projects/${projectId}`)
      projectMeta.value = meta

      if (meta.status === 'ready') {
        pausePolling()
        await fetchChartData()
      }
      else if (meta.status === 'error') {
        pausePolling()
        dataLoading.value = false
      }
      // 仍处于 cloning/analyzing 时 useIntervalFn 自动继续
    }
    catch {
      pausePolling()
      dataLoading.value = false
    }
  }

  const interval = useIntervalFn(pollCallback, POLL_INTERVAL_MS, { immediate: false })
  pausePolling = interval.pause
  resumePolling = interval.resume

  onMounted(fetchProjectData)
  onUnmounted(pausePolling)

  // -- Actions --
  async function handleReanalyze() {
    try {
      await $fetch(`/api/projects/${projectId}/reanalyze`, { method: 'POST' })
      dataLoading.value = true
      dataError.value = null
      resumePolling()
    }
    catch (err: any) {
      dataError.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Failed to trigger reanalysis.'
      dataLoading.value = false
    }
  }

  return {
    // 状态
    projectMeta: readonly(projectMeta),
    dailyData: readonly(dailyData),
    monthlyData: readonly(monthlyData),
    healthSignals: readonly(healthSignals),
    selectedMonth,
    visibleRange,
    loading: readonly(loading),
    error: readonly(error),

    // 状态判断
    isReady: readonly(isReady),
    isError: readonly(isError),
    isProcessing: readonly(isProcessing),
    stageLabel: readonly(stageLabel),
    errorGuidance: readonly(errorGuidance),

    // 派生数据
    availableMonths: readonly(availableMonths),
    availableYears: readonly(availableYears),

    // Actions
    handleReanalyze,
  }
}
