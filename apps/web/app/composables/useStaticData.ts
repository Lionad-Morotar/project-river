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

export interface StaticProjectBundle {
  project: StaticProjectMeta
  daily: DailyRow[]
  monthly: MonthlyRow[]
  health: { signals: HealthSignal[] }
}

const BUNDLE_PATH = '/data/demo.bin'

// Singleton — load once per session
let cachedBundle: StaticProjectBundle | null = null
let loadPromise: Promise<StaticProjectBundle> | null = null

export function useStaticData() {
  const bundle = ref<StaticProjectBundle | null>(cachedBundle)
  const loading = ref(bundle.value === null)
  const error = ref<string | null>(null)

  async function load(): Promise<StaticProjectBundle> {
    if (cachedBundle)
      return cachedBundle

    if (loadPromise)
      return loadPromise

    loadPromise = (async () => {
      const config = useRuntimeConfig()
      const base = config.app.baseURL || '/'
      const url = `${base}${BUNDLE_PATH}`.replace(/\/+/g, '/').replace(':/', '://')
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(`Failed to load demo data (HTTP ${response.status})`)

      const compressed = new Uint8Array(await response.arrayBuffer())
      const json = pako.inflate(compressed, { to: 'string' })
      const data = JSON.parse(json) as StaticProjectBundle
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

    return loadPromise as Promise<StaticProjectBundle>
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
