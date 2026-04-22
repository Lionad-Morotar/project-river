import type { DailyRow } from '~/utils/d3Helpers'

export type EventType
  = | 'contributor_first_commit'
    | 'contributor_exit'
    | 'activity_spike'
    | 'activity_drop'
    | 'major_refactor'
    | 'commit_milestone'
    | 'project_start'
    | 'project_archived'

export type EventSeverity = 'info' | 'positive' | 'warning'

export interface ProjectEvent {
  id: string
  type: EventType
  date: string
  severity: EventSeverity
  priority: number
  impactScore: number
  titleKey: string
  descriptionKey: string
  params: Record<string, string | number>
  contributors?: string[]
}

export interface EventGroupNode {
  id: string
  labelKey: string
  severity?: EventSeverity
  defaultChecked: boolean
  defaultLimit?: number // default: show top N; undefined = show all
  children?: EventGroupNode[]
  eventTypes?: EventType[]
}

interface EventDetectionResponse {
  events: ProjectEvent[]
  stats: {
    totalEvents: number
    durationMs: number
  }
}

// ── Default event tree groups ──
// Default: only major_refactor top 8 + always-show events (exits, milestones)
// Others available via manual check
export const defaultEventGroups: EventGroupNode[] = [
  {
    id: 'contributors',
    labelKey: 'events.group.contributors',
    defaultChecked: false,
    children: [
      { id: 'contributor_first_commit', labelKey: 'events.title.contributor_first_commit', severity: 'positive', defaultChecked: false, defaultLimit: 10, eventTypes: ['contributor_first_commit'] },
      { id: 'contributor_exit', labelKey: 'events.title.contributor_exit', severity: 'warning', defaultChecked: false, eventTypes: ['contributor_exit'] },
    ],
  },
  {
    id: 'activity',
    labelKey: 'events.group.activity',
    defaultChecked: false,
    children: [
      { id: 'activity_spike', labelKey: 'events.title.activity_spike', severity: 'info', defaultChecked: false, defaultLimit: 8, eventTypes: ['activity_spike'] },
      { id: 'activity_drop', labelKey: 'events.title.activity_drop', severity: 'warning', defaultChecked: false, eventTypes: ['activity_drop'] },
    ],
  },
  {
    id: 'code',
    labelKey: 'events.group.code',
    defaultChecked: true,
    children: [
      { id: 'major_refactor', labelKey: 'events.title.major_refactor', severity: 'info', defaultChecked: true, defaultLimit: 8, eventTypes: ['major_refactor'] },
    ],
  },
  {
    id: 'milestones',
    labelKey: 'events.group.milestones',
    defaultChecked: false,
    children: [
      { id: 'project_start', labelKey: 'events.title.project_start', severity: 'positive', defaultChecked: false, eventTypes: ['project_start'] },
      { id: 'project_archived', labelKey: 'events.title.project_archived', severity: 'warning', defaultChecked: true, eventTypes: ['project_archived'] },
      { id: 'commit_milestone', labelKey: 'events.title.commit_milestone', severity: 'positive', defaultChecked: false, eventTypes: ['commit_milestone'] },
    ],
  },
]

// Flatten all group IDs (parent + leaf)
export function getAllGroupIds(groups: EventGroupNode[]): string[] {
  const ids: string[] = []
  for (const g of groups) {
    ids.push(g.id)
    if (g.children) {
      for (const c of g.children)
        ids.push(c.id)
    }
  }
  return ids
}

// Collect event types for a group ID (including children)
export function getEventTypesForGroup(id: string, groups: EventGroupNode[]): EventType[] {
  for (const g of groups) {
    if (g.id === id)
      return g.eventTypes || g.children?.flatMap(c => c.eventTypes || []) || []
    if (g.children) {
      for (const c of g.children) {
        if (c.id === id)
          return c.eventTypes || []
      }
    }
  }
  return []
}

let workerInstance: Worker | null = null
let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (workerInstance)
    return Promise.resolve(workerInstance)
  if (workerPromise)
    return workerPromise

  workerPromise = new Promise((resolve, reject) => {
    try {
      const WorkerCtor = new Worker(
        new URL('../workers/projectEvents.worker.ts', import.meta.url),
        { type: 'module' },
      )
      workerInstance = WorkerCtor
      resolve(WorkerCtor)
    }
    catch (e) {
      console.error('[useProjectEvents] Worker creation failed:', e)
      reject(e)
    }
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
  groups: EventGroupNode[]
  selectedGroupIds: Ref<Set<string>>
  expandedGroupIds: Ref<Set<string>> // groups where user wants "show all" instead of top N
  toggleGroup: (id: string, checked: boolean) => void
  toggleExpanded: (id: string) => void
  markerEvents: ComputedRef<ProjectEvent[]>
  loading: Ref<boolean>
  getEventsInRange: (start: string, end: string) => ProjectEvent[]
}

export function useProjectEvents(dailyData: Ref<DailyRow[]>): UseProjectEventsReturn {
  const events = ref<ProjectEvent[]>([])
  const loading = ref(false)

  // Group selection state — default from group config
  const selectedGroupIds = ref<Set<string>>(new Set(
    defaultEventGroups.flatMap((g) => {
      const ids: string[] = []
      if (g.defaultChecked)
        ids.push(g.id)
      if (g.children) {
        for (const c of g.children) {
          if (c.defaultChecked)
            ids.push(c.id)
        }
      }
      return ids
    }),
  ))

  // Expanded groups: user wants "show all" instead of top N
  const expandedGroupIds = ref<Set<string>>(new Set())

  function toggleGroup(id: string, checked: boolean) {
    const next = new Set(selectedGroupIds.value)
    if (checked)
      next.add(id)
    else
      next.delete(id)
    selectedGroupIds.value = next
  }

  function toggleExpanded(id: string) {
    const next = new Set(expandedGroupIds.value)
    if (next.has(id))
      next.delete(id)
    else
      next.add(id)
    expandedGroupIds.value = next
  }

  // Events filtered by selected groups, with top-N truncation, sorted for markers
  const markerEvents = computed(() => {
    // Collect allowed types from selected leaf IDs only (parent IDs do not expand)
    const allowedTypes = new Set<EventType>()
    for (const id of selectedGroupIds.value) {
      for (const g of defaultEventGroups) {
        // check leaf children
        if (g.children) {
          for (const c of g.children) {
            if (c.id === id && c.eventTypes) {
              for (const t of c.eventTypes)
                allowedTypes.add(t)
            }
          }
        }
        // check top-level leaf (if any)
        if (g.id === id && g.eventTypes) {
          for (const t of g.eventTypes)
            allowedTypes.add(t)
        }
      }
    }

    // Filter by type
    const filtered = events.value.filter(e => allowedTypes.has(e.type))

    // Apply top-N truncation per type (unless group is expanded)
    const truncated: ProjectEvent[] = []
    const byType = new Map<EventType, ProjectEvent[]>()
    for (const e of filtered) {
      const list = byType.get(e.type) || []
      list.push(e)
      byType.set(e.type, list)
    }

    for (const [type, list] of byType) {
      // Find if this type has a limit and if it's expanded
      let limit: number | undefined
      let isExpanded = false
      for (const g of defaultEventGroups) {
        if (g.children) {
          for (const c of g.children) {
            if (c.eventTypes?.includes(type)) {
              limit = c.defaultLimit
              if (expandedGroupIds.value.has(c.id))
                isExpanded = true
            }
          }
        }
      }

      if (limit !== undefined && !isExpanded) {
        // Sort by impactScore desc, then date asc
        const sorted = [...list].sort((a, b) => b.impactScore - a.impactScore || a.date.localeCompare(b.date))
        truncated.push(...sorted.slice(0, limit))
      }
      else {
        truncated.push(...list)
      }
    }

    // Final sort: date asc, priority desc
    return truncated.sort((a, b) => a.date.localeCompare(b.date) || b.priority - a.priority)
  })

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
          console.error('[useProjectEvents] worker error:', e.message)
          reject(new Error(e.message))
        }
        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        // Deep clone to strip Vue reactivity proxies before Structured Clone
        worker.postMessage({ dailyData: JSON.parse(JSON.stringify(data)) })
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
    groups: defaultEventGroups,
    selectedGroupIds: readonly(selectedGroupIds) as Ref<Set<string>>,
    expandedGroupIds: readonly(expandedGroupIds) as Ref<Set<string>>,
    toggleGroup,
    toggleExpanded,
    markerEvents,
    loading: readonly(loading) as Ref<boolean>,
    getEventsInRange,
  }
}

// Expose terminate for app-level cleanup if needed
export { terminateWorker }
