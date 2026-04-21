import type { DailyRow } from '~/utils/d3Helpers'

export type EventType
  = | 'contributor_first_commit'
    | 'contributor_exit'
    | 'activity_spike'
    | 'activity_drop'
    | 'major_refactor'
    | 'commit_milestone'
    | 'project_start'

export type EventSeverity = 'info' | 'positive' | 'warning'

export interface ProjectEvent {
  id: string
  type: EventType
  date: string
  severity: EventSeverity
  titleKey: string
  descriptionKey: string
  params: Record<string, string | number>
  contributors?: string[]
}

interface EventDetectionResponse {
  events: ProjectEvent[]
  stats: {
    totalEvents: number
    durationMs: number
  }
}

let workerInstance: Worker | null = null
let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (workerInstance)
    return Promise.resolve(workerInstance)
  if (workerPromise)
    return workerPromise

  workerPromise = new Promise((resolve) => {
    // Vite handles ?worker imports — bundles the worker file separately
    const WorkerCtor = new Worker(
      new URL('../workers/projectEvents.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerInstance = WorkerCtor
    resolve(WorkerCtor)
  })

  return workerPromise
}

function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
    workerPromise = null
  }
}

// Simple hash for cache key
function hashData(data: DailyRow[]): string {
  let hash = 0
  const str = JSON.stringify(data)
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `${hash}:${data.length}`
}

const cache = new Map<string, ProjectEvent[]>()

export interface UseProjectEventsReturn {
  events: Ref<ProjectEvent[]>
  eventsByMonth: ComputedRef<Map<string, ProjectEvent[]>>
  loading: Ref<boolean>
  getEventsInRange: (start: string, end: string) => ProjectEvent[]
}

export function useProjectEvents(dailyData: Ref<DailyRow[]>): UseProjectEventsReturn {
  const events = ref<ProjectEvent[]>([])
  const loading = ref(false)

  async function computeEvents() {
    const data = dailyData.value
    if (data.length === 0) {
      events.value = []
      return
    }

    const cacheKey = hashData(data)
    const cached = cache.get(cacheKey)
    if (cached) {
      events.value = cached
      return
    }

    loading.value = true
    try {
      const worker = await getWorker()
      const result = await new Promise<EventDetectionResponse>((resolve, reject) => {
        function onMessage(e: MessageEvent<EventDetectionResponse>) {
          worker.removeEventListener('message', onMessage)
          worker.removeEventListener('error', onError)
          resolve(e.data)
        }
        function onError(e: ErrorEvent) {
          worker.removeEventListener('message', onMessage)
          worker.removeEventListener('error', onError)
          reject(new Error(e.message))
        }
        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        worker.postMessage({ dailyData: data })
      })

      cache.set(cacheKey, result.events)
      events.value = result.events
    }
    catch (e) {
      console.error('[useProjectEvents] Worker failed:', e)
      events.value = []
    }
    finally {
      loading.value = false
    }
  }

  // Watch dailyData changes
  watch(() => dailyData.value, computeEvents, { immediate: true })

  // Cleanup on scope dispose
  onScopeDispose(() => {
    // Only terminate if no other component is using it
    // For now, keep worker alive — it's lightweight
  })

  // Group events by month (YYYY-MM)
  const eventsByMonth = computed(() => {
    const map = new Map<string, ProjectEvent[]>()
    for (const event of events.value) {
      const month = event.date.substring(0, 7)
      const list = map.get(month) || []
      list.push(event)
      map.set(month, list)
    }
    // Sort each month's events by date
    for (const list of map.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date))
    }
    return map
  })

  function getEventsInRange(start: string, end: string): ProjectEvent[] {
    return events.value.filter(e => e.date >= start && e.date <= end)
  }

  return {
    events: readonly(events) as Ref<ProjectEvent[]>,
    eventsByMonth,
    loading: readonly(loading) as Ref<boolean>,
    getEventsInRange,
  }
}

// Expose terminate for app-level cleanup if needed
export { terminateWorker }
