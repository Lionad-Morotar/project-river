<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useProjectImport } from '~/composables/useProjectImport'
import { getProjectById, useStaticData } from '~/composables/useStaticData'
import { getErrorGuidance } from '~/utils/errorGuidance'

interface Project {
  id: number
  name: string
  fullName: string | null
  status: string
  lastAnalyzedAt: Date | null
}

const config = useRuntimeConfig()
const isStatic = config.public.staticMode === true

const { locale, setLocale } = useI18n()
const colorMode = useColorMode()

const {
  status: importStatus,
  stageLabel,
  errorMessage: importError,
  importRepo,
  reset: resetImport,
} = useProjectImport()

const url = ref('')
const projects = ref<Project[]>([])
const projectsLoading = ref(true)
const projectsError = ref<string | null>(null)

const isImportActive = computed(() =>
  importStatus.value === 'importing'
  || importStatus.value === 'analyzing'
  || importStatus.value === 'redirecting',
)

const canSubmit = computed(() => url.value.trim().length > 0 && !isImportActive.value)

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

// -- Static mode: use pre-built demo data --
const { bundle: staticBundle } = useStaticData()

const demoProjects = computed<Project[]>(() => {
  if (!staticBundle.value)
    return []
  return staticBundle.value.projects.map(p => ({
    id: p.project.id,
    name: p.project.name,
    fullName: p.project.fullName,
    status: p.project.status,
    lastAnalyzedAt: p.project.lastAnalyzedAt ? new Date(p.project.lastAnalyzedAt) : null,
  }))
})

// -- Static mode: demo project selector --
const selectedDemoProjectId = ref<number | null>(null)

const selectedDemoBundle = computed(() => {
  if (!staticBundle.value || !selectedDemoProjectId.value)
    return null
  return getProjectById(staticBundle.value, selectedDemoProjectId.value)
})

const selectedDemoDailyData = computed(() => selectedDemoBundle.value?.daily ?? [])

const selectedDemoStats = computed(() => {
  const daily = selectedDemoDailyData.value
  if (daily.length === 0) {
    return [
      { value: 0, labelKey: 'home.statCommits', suffix: '+' },
      { value: 0, labelKey: 'home.statContributors', suffix: '+' },
      { value: 0, labelKey: 'home.statYears', suffix: 'yr', decimals: 1 },
      { value: 0, labelKey: 'home.statFiles', suffix: '+' },
    ]
  }

  let totalCommits = 0
  const contributors = new Set<string>()
  let totalFiles = 0
  let minDate = daily[0]!.date
  let maxDate = daily[0]!.date

  for (const d of daily) {
    totalCommits += d.commits
    contributors.add(d.contributor)
    totalFiles += d.filesTouched
    if (d.date < minDate)
      minDate = d.date
    if (d.date > maxDate)
      maxDate = d.date
  }

  const years = (new Date(maxDate).getTime() - new Date(minDate).getTime()) / (365.25 * 86400000)

  return [
    { value: totalCommits, labelKey: 'home.statCommits', suffix: '+' },
    { value: contributors.size, labelKey: 'home.statContributors', suffix: '+' },
    { value: years, labelKey: 'home.statYears', suffix: 'yr', decimals: 1 },
    { value: totalFiles, labelKey: 'home.statFiles', suffix: '+' },
  ]
})

/** Fetch project list */
async function fetchProjects() {
  projectsLoading.value = true
  projectsError.value = null
  try {
    const data = await $fetch<Project[]>('/api/projects')
    projects.value = data
  }
  catch (err: any) {
    projectsError.value = err?.data?.statusMessage || err?.message || 'Failed to load projects.'
  }
  finally {
    projectsLoading.value = false
  }
}

onMounted(() => {
  if (!isStatic) {
    fetchProjects()
  }
  else {
    projectsLoading.value = false
  }
  window.addEventListener('scroll', handleNavScroll, { passive: true })
  handleNavScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleNavScroll)
})

/** Submit URL for import */
async function handleSubmit() {
  if (!canSubmit.value)
    return

  const result = await importRepo(url.value)

  if (result.success) {
    return
  }

  await fetchProjects()
}

/** Get human-friendly error guidance based on error prefix */
const errorGuidance = computed(() => getErrorGuidance(importError.value))

/* -- Import guard: prevent accidental page close during clone/analyze -- */
function beforeUnloadHandler(e: BeforeUnloadEvent) {
  e.preventDefault()
  e.returnValue = ''
}

watch(isImportActive, (active) => {
  if (active)
    window.addEventListener('beforeunload', beforeUnloadHandler)
  else
    window.removeEventListener('beforeunload', beforeUnloadHandler)
})

/* -- Nav visibility: hide during hero, show after hero scrolls out -- */
</script>

<template>
  <div class="relative flex flex-col bg-default min-h-screen">
    <!-- Full-page Git River background -->
    <GitRiverCanvas />

    <!-- Top-right controls: theme + locale -->
    <div class="fixed top-4 right-6 z-50 flex items-center gap-1">
      <button
        class="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-default transition-colors"
        :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        <svg
          v-if="colorMode.value === 'dark'"
          xmlns="http://www.w3.org/2000/svg"
          class="w-4 h-4"
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
          class="w-4 h-4"
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
        class="rounded-md px-2 py-1 font-medium text-muted hover:bg-elevated hover:text-default text-xs transition-colors"
        @click="toggleLocale"
      >
        {{ locale === 'zh-CN' ? 'EN' : '中' }}
      </button>
    </div>

    <!-- Hero Section - Fullscreen 100dvh -->
    <section class="relative flex items-center min-h-[100dvh] overflow-hidden">
      <!-- Background overlay for text readability over river -->
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-default/30 to-default/80 pointer-events-none" />

      <div class="z-20 relative mx-auto -mt-20 px-6 lg:px-10 py-24 w-full max-w-6xl">
        <!-- Tagline badge -->
        <div class="hero-enter hero-enter-1">
          <div class="inline-flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-md px-4 py-1.5 border border-[var(--glass-border)] rounded-full text-dimmed text-xs" style="box-shadow: var(--glass-inner), 0 2px 12px rgba(0,0,0,0.12);">
            <span class="bg-emerald-400 rounded-full w-1.5 h-1.5 animate-pulse" style="box-shadow: 0 0 6px rgba(52,211,153,0.4);" />
            {{ $t('home.tagline') }}
          </div>
        </div>

        <!-- H1 -- Plus Jakarta Sans Medium 500 Italic -->
        <h1 class="mt-6 font-['Plus_Jakarta_Sans'] font-medium italic text-highlighted text-7xl sm:text-8xl lg:text-9xl leading-[0.9] tracking-tighter hero-enter hero-enter-2 dark:[text-shadow:0_4px_30px_rgba(0,0,0,0.4)]">
          Project<br>River
        </h1>

        <!-- Subtitle + Form row -->
        <div class="items-start gap-8 lg:gap-12 grid grid-cols-1 lg:grid-cols-12 mt-10 lg:mt-12">
          <!-- Left column: description + CTA -->
          <div class="lg:col-span-7">
            <p class="max-w-md text-dimmed text-lg leading-relaxed hero-enter hero-enter-3">
              {{ isStatic ? $t('home.subtitleStatic') : $t('home.subtitle') }}
            </p>

            <!-- URL Input CTA -->
            <form
              v-if="!isStatic"
              class="flex gap-2 mt-8 max-w-md hero-enter hero-enter-3"
              @submit.prevent="handleSubmit"
            >
              <UInput
                v-model="url"
                :placeholder="$t('home.placeholder')"
                :disabled="isImportActive"
                icon="i-lucide-link"
                size="lg"
                class="flex-1"
                @keydown.enter.prevent="handleSubmit"
              />
              <UButton
                type="submit"
                size="lg"
                :loading="isImportActive"
                :disabled="!canSubmit"
                icon="i-lucide-arrow-right"
                trailing
              >
                <template v-if="!isImportActive">
                  {{ $t('home.import') }}
                </template>
                <template v-else>
                  {{ stageLabel }}
                </template>
              </UButton>
            </form>

            <!-- Static mode CTA: demo project selector -->
            <div v-else class="mt-8 hero-enter hero-enter-3">
              <div class="flex items-center gap-2">
                <select
                  v-model="selectedDemoProjectId"
                  class="flex-1 px-4 py-3 bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] rounded-lg text-default text-sm focus:outline-none focus:ring-2 focus:ring-accented/50"
                  style="box-shadow: var(--glass-inner);"
                >
                  <option :value="null" disabled>
                    {{ $t('home.selectDemo') }}
                  </option>
                  <option v-for="p in demoProjects" :key="p.id" :value="p.id">
                    {{ p.fullName || p.name }}
                  </option>
                </select>
                <button
                  class="inline-flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-md px-7 py-3 border border-[var(--glass-border)] rounded-lg font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:hover:scale-100"
                  style="box-shadow: var(--glass-inner), 0 6px 28px rgba(0,0,0,0.22), 0 0 32px rgba(100,180,255,0.12);"
                  :disabled="!selectedDemoProjectId"
                  @click="handleViewDemo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {{ $t('home.viewDemo') }}
                </button>
              </div>
            </div>

            <!-- Import progress -->
            <div
              v-if="isImportActive"
              class="flex items-center gap-3 mt-4 text-dimmed text-sm"
            >
              <span class="inline-block bg-amber-400 rounded-full w-1.5 h-1.5 animate-pulse" />
              {{ stageLabel }}
            </div>

            <!-- Error -->
            <div
              v-if="importStatus === 'error' && (errorGuidance || importError)"
              class="mt-4 max-w-md"
            >
              <div class="bg-red-950/30 p-4 border border-red-800/60 rounded-md">
                <p class="font-medium text-red-300 text-sm">
                  {{ errorGuidance?.title ? $t(errorGuidance.title) : $t('import.failed') }}
                </p>
                <p
                  v-if="errorGuidance?.hint"
                  class="mt-1 text-red-400/80 text-xs"
                >
                  {{ errorGuidance.hintParams ? $t(errorGuidance.hint, errorGuidance.hintParams) : $t(errorGuidance.hint) }}
                </p>
                <p
                  v-else-if="importError"
                  class="mt-1 text-red-400/80 text-xs"
                >
                  {{ importError }}
                </p>
                <button
                  class="mt-3 text-red-300 hover:text-red-200 text-xs underline underline-offset-2"
                  @click="resetImport"
                >
                  {{ $t('common.tryAgain') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Right column: Stats grid (static mode: selected demo stats) -->
          <div class="lg:col-span-5 lg:ml-auto hero-enter hero-enter-4">
            <div v-if="isStatic && selectedDemoBundle" class="space-y-4">
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-dimmed/50 uppercase tracking-widest">{{ $t('home.dataFromProject') }}</span>
                <span class="font-mono text-muted text-xs">{{ selectedDemoBundle.project.fullName || selectedDemoBundle.project.name }}</span>
              </div>
              <div class="gap-4 grid grid-cols-2">
                <StatsCard
                  v-for="(stat, i) in selectedDemoStats"
                  :key="stat.labelKey"
                  :value="stat.value"
                  :label="$t(stat.labelKey)"
                  :suffix="stat.suffix"
                  :decimals="stat.decimals"
                  :delay="100 + i * 100"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
