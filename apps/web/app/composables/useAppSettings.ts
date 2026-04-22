/**
 * Theme presets for contributor color scheme.
 * Each theme defines a base hue and spread — contributor hue = baseHue + tDate * spread.
 */
export interface ColorTheme {
  id: string
  label: string
  baseHue: number
  spread: number
  swatches: [string, string, string]
  /** Mapped Nuxt UI primary color name */
  uiPrimary: string
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'nebula', label: '星云', baseHue: 260, spread: 90, swatches: ['#818cf8', '#a78bfa', '#c084fc'], uiPrimary: 'violet' },
  { id: 'amber', label: '琥珀', baseHue: 30, spread: 70, swatches: ['#fcd34d', '#fbbf24', '#f59e0b'], uiPrimary: 'amber' },
  { id: 'default', label: '默认', baseHue: 160, spread: 120, swatches: ['#2dd4bf', '#8b5cf6', '#a855f7'], uiPrimary: 'green' },
  { id: 'sunset', label: '日落', baseHue: 10, spread: 80, swatches: ['#f87171', '#f59e0b', '#fbbf24'], uiPrimary: 'rose' },
]

const STORAGE_KEY = 'project-river-settings'

export interface AppSettings {
  themeIndex: number
  saveLocally: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  themeIndex: 0,
  saveLocally: false,
}

/** Load settings from LocalStorage */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    return {
      themeIndex: Number(parsed.themeIndex) || 0,
      saveLocally: parsed.saveLocally ?? DEFAULT_SETTINGS.saveLocally,
    }
  }
  catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Save settings to LocalStorage (only if saveLocally is true) */
export function saveSettings(settings: AppSettings) {
  if (settings.saveLocally) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }
  else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

/** Get the active theme config by index. */
export function getThemeByIndex(index: number): ColorTheme {
  if (index < 0 || index >= COLOR_THEMES.length)
    return COLOR_THEMES[2]! // fallback to 'default'
  return COLOR_THEMES[index]!
}

/** Sync theme to Nuxt UI primary color */
function syncUIPrimary(theme: ColorTheme) {
  const appConfig = useAppConfig()
  appConfig.ui = appConfig.ui ?? {}
  appConfig.ui.colors = appConfig.ui.colors ?? {}
  appConfig.ui.colors.primary = theme.uiPrimary
}

/** Vue composable for reactive app settings — singleton via useState */
export function useAppSettings() {
  const settings = useState<AppSettings>('app-settings', () => loadSettings())
  const activeTheme = computed(() => getThemeByIndex(settings.value.themeIndex))

  // Sync on init
  syncUIPrimary(activeTheme.value)

  function updateTheme(index: number) {
    settings.value = { ...settings.value, themeIndex: index }
    saveSettings(settings.value)
    syncUIPrimary(getThemeByIndex(index))
  }

  function toggleSaveLocally(enabled: boolean) {
    settings.value = { ...settings.value, saveLocally: enabled }
    saveSettings(settings.value)
  }

  return {
    settings: readonly(settings),
    activeTheme,
    updateTheme,
    toggleSaveLocally,
  }
}
