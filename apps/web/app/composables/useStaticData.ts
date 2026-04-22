import type { DailyRow } from '~/utils/d3Helpers'
import type { HealthSignal } from '~/utils/healthRules'
import type { MonthlyRow } from '~/utils/monthDetailHelpers'
import pako from 'pako'

export interface StaticProjectMeta {
  id: number
  name: string
  path: string
  url: string | null
  fullName: string | null
  status: string
  description: string | null
  lastAnalyzedAt: string | null
  errorMessage: string | null
  createdAt: string
}

/** Per-project data bundle */
export interface ProjectDataBundle {
  project: StaticProjectMeta
  daily: DailyRow[]
  monthly: MonthlyRow[]
  health: { signals: HealthSignal[] }
}

/** Multi-project static bundle */
export interface StaticDataBundle {
  version: 1
  projects: readonly ProjectDataBundle[]
}

// Relative path so new URL() resolves against baseURL correctly
const BUNDLE_PATH = 'data/demo.bin'

// Singleton — load once per session
let cachedBundle: StaticDataBundle | null = null
let loadPromise: Promise<StaticDataBundle> | null = null

/** Lookup a project by its database ID */
export function getProjectById(bundle: Readonly<StaticDataBundle>, projectId: number): ProjectDataBundle | undefined {
  return bundle.projects.find(p => p.project.id === projectId)
}

/** Get all project metadata for listing */
export function getAllProjectMeta(bundle: StaticDataBundle): StaticProjectMeta[] {
  return bundle.projects.map(p => p.project)
}

/** Convert object-of-arrays back to array-of-objects */
function fromColumnar(col: Record<string, any[]>): any[] {
  const keys = Object.keys(col)
  if (keys.length === 0)
    return []
  const len = col[keys[0]!]!.length
  const rows: any[] = Array.from({ length: len })
  for (let i = 0; i < len; i++) {
    const row: Record<string, any> = {}
    for (const k of keys)
      row[k] = col[k]![i]
    rows[i] = row
  }
  return rows
}

/** Convert columnar bundle (v2) to row-based StaticDataBundle */
function normalizeBundle(raw: any): StaticDataBundle {
  const projects = raw.projects.map((p: any) => ({
    project: p.project,
    daily: fromColumnar(p.daily),
    monthly: fromColumnar(p.monthly),
    health: p.health,
  }))
  return { version: 1, projects }
}

export function useStaticData() {
  const bundle = ref<StaticDataBundle | null>(cachedBundle)
  const loading = ref(bundle.value === null)
  const error = ref<string | null>(null)

  async function load(): Promise<StaticDataBundle> {
    if (cachedBundle)
      return cachedBundle

    if (loadPromise)
      return loadPromise

    loadPromise = (async () => {
      const config = useRuntimeConfig()
      const base = config.app.baseURL || '/'
      const url = new URL(BUNDLE_PATH, window.location.origin + base).href
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(`Failed to load demo data (HTTP ${response.status})`)

      const compressed = new Uint8Array(await response.arrayBuffer())
      const json = pako.inflate(compressed, { to: 'string' })
      const raw = JSON.parse(json)
      const data = normalizeBundle(raw)
      cachedBundle = data
      return data
    })()

    try {
      const data = await loadPromise
      bundle.value = data
    }
    catch (e: any) {
      error.value = e.message || 'Failed to load demo data'
    }
    finally {
      loading.value = false
    }

    return loadPromise as Promise<StaticDataBundle>
  }

  if (!bundle.value && !loadPromise) {
    load()
  }
  else if (loadPromise && !bundle.value) {
    loadPromise.then((data) => {
      bundle.value = data
      loading.value = false
    })
  }

  return { bundle: readonly(bundle), loading: readonly(loading), error: readonly(error) }
}
