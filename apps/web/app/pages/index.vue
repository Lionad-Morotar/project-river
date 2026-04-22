<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ProjectCard from '~/components/ProjectCard.vue'
import { useProjectImport } from '~/composables/useProjectImport'
import { useStaticData } from '~/composables/useStaticData'
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
const { bundle: staticBundle, loading: staticLoading } = useStaticData()

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

/** Re-analyze an existing project */
async function handleReanalyze(projectId: number) {
  try {
    await $fetch(`/api/projects/${projectId}/reanalyze`, { method: 'POST' })
    await fetchProjects()
  }
  catch {
    await fetchProjects()
  }
}

/** Delete a project */
async function handleDelete(projectId: number) {
  try {
    await $fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    projects.value = projects.value.filter(p => p.id !== projectId)
  }
  catch {
    await fetchProjects()
  }
}

/** Get human-friendly error guidance based on error prefix */
const errorGuidance = computed(() => getErrorGuidance(importError.value))

// ── Atom project data for landing page showcase ──
const atomBundle = computed(() =>
  staticBundle.value?.projects.find(p => p.project.fullName === 'atom/atom'),
)
const atomDailyData = computed(() => atomBundle.value?.daily ?? [])
const atomHealthSignals = computed(() => atomBundle.value?.health.signals ?? [])

/** Top 5 contributors by total commits from atom project */
const atomTopContributors = computed(() => {
  const daily = atomDailyData.value
  if (daily.length === 0)
    return []
  const map = new Map<string, number>()
  for (const d of daily)
    map.set(d.contributor, (map.get(d.contributor) ?? 0) + d.commits)
  return Array.from(map.entries())
    .map(([name, commits]) => ({ name, commits }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 5)
})

/** Aggregate stats from atom project */
const atomStats = computed(() => {
  const daily = atomDailyData.value
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

/** Total commits count for the streamgraph overlay */
const atomTotalCommits = computed(() => {
  const daily = atomDailyData.value
  let total = 0
  for (const d of daily)
    total += d.commits
  return total
})

/** Max commits among top contributors — for bar width calculation */
const atomMaxContributorCommits = computed(() => {
  const top = atomTopContributors.value
  if (top.length === 0)
    return 1
  return top[0]!.commits
})

/** Severity → color mapping for health signals */
function severityColor(severity: string): string {
  if (severity === 'positive')
    return 'emerald'
  if (severity === 'warning')
    return 'amber'
  return 'blue'
}

/* ─── Import guard: prevent accidental page close during clone/analyze ─── */
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

/* ─── Nav visibility: hide during hero, show after hero scrolls out ─── */
const navVisible = ref(false)

function handleNavScroll() {
  const vh = window.innerHeight
  const scrollY = window.scrollY
  // Hysteresis thresholds to prevent flickering
  if (scrollY > vh * 0.85)
    navVisible.value = true
  else if (scrollY < vh * 0.5)
    navVisible.value = false
}
</script>

<template>
  <div class="relative flex flex-col bg-default min-h-screen">
    <!-- Full-page Git River background -->
    <GitRiverCanvas />

    <!-- Navigation -->
    <nav
      class="top-0 right-0 left-0 z-50 fixed backdrop-blur-xl border-[var(--glass-border)] border-b transition-transform duration-300 ease-out"
      :class="navVisible ? 'translate-y-0' : '-translate-y-full'"
      style="background: var(--glass-bg); box-shadow: var(--glass-inner);"
    >
      <div class="flex justify-between items-center mx-auto px-6 lg:px-10 max-w-6xl h-12">
        <div class="flex items-center gap-2">
          <div class="flex justify-center items-center bg-accented/20 rounded-sm w-5 h-5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12h20" />
              <path d="M2 12c2-4 4-6 6-6s4 4 6 4 4-4 6-4" />
              <path d="M2 12c2 4 4 6 6 6s4-4 6-4 4 4 6 4" />
            </svg>
          </div>
          <span class="font-semibold text-highlighted text-sm tracking-tight">Project River</span>
        </div>
        <div class="flex items-center gap-1">
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
            class="hover:bg-elevated px-2 py-1 rounded-md font-medium text-muted hover:text-default text-xs transition-colors"
            @click="toggleLocale"
          >
            {{ locale === 'zh-CN' ? 'EN' : '中' }}
          </button>
        </div>
      </div>
    </nav>

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

        <!-- H1 — massive, Outfit font -->
        <h1 class="mt-6 font-[Outfit] font-bold text-highlighted text-7xl sm:text-8xl lg:text-9xl leading-[0.9] tracking-tighter hero-enter hero-enter-2 dark:[text-shadow:0_4px_30px_rgba(0,0,0,0.4)]">
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

            <!-- Static mode CTA -->
            <div v-else class="mt-8 hero-enter hero-enter-3">
              <NuxtLink
                :to="demoProjects.length > 0 ? `/projects/${demoProjects[0]!.id}` : '/'"
                class="inline-flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-md px-7 py-3 border border-[var(--glass-border)] rounded-lg font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-300" style="box-shadow: var(--glass-inner), 0 6px 28px rgba(0,0,0,0.22), 0 0 32px rgba(100,180,255,0.12);"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {{ $t('home.viewDemo') }}
              </NuxtLink>
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

          <!-- Right column: Stats grid -->
          <div class="lg:col-span-5 lg:ml-auto hero-enter hero-enter-4">
            <!-- Project attribution -->
            <div class="flex items-center gap-2 mb-4">
              <span class="text-[10px] text-dimmed/50 uppercase tracking-widest">{{ $t('home.dataFromProject') }}</span>
              <span class="font-mono text-muted text-xs">atom/atom</span>
            </div>
            <div class="gap-4 grid grid-cols-2">
              <StatsCard
                v-for="(stat, i) in atomStats"
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
    </section>

    <!-- Flowing section divider -->
    <div class="relative w-full h-[2px] overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--glow-cyan)] to-transparent animate-flow" style="background-size: 200% 100%; box-shadow: 0 0 12px rgba(100,200,255,0.15);" />
    </div>

    <!-- Features - Bento Dashboard Preview -->
    <section class="relative">
      <div class="absolute inset-0 bg-gradient-to-b from-default/50 via-default/30 to-default/50 pointer-events-none" />
      <div class="z-10 relative mx-auto px-6 lg:px-10 py-24 max-w-6xl">
        <!-- Section header -->
        <div class="mb-10">
          <p class="mb-3 font-medium text-accented text-xs uppercase tracking-widest">
            {{ $t('home.featuresLabel') }}
          </p>
          <h2 class="font-bold text-highlighted text-3xl tracking-tight dark:[text-shadow:0_2px_12px_rgba(0,0,0,0.2)]">
            {{ $t('home.featuresTitle') }}
          </h2>
        </div>

        <!-- Bento grid: 2-row asymmetric layout -->
        <div class="gap-4 grid grid-cols-1 lg:grid-cols-12">
          <!-- Row 1: Streamgraph (full width) -->
          <div class="relative lg:col-span-12 bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] rounded-2xl min-h-[280px] lg:min-h-[360px] overflow-hidden" style="box-shadow: var(--glass-inner), 0 10px 40px rgba(0,0,0,0.22);">
            <!-- Top glow line -->
            <div class="top-0 right-6 left-6 absolute bg-gradient-to-r from-transparent via-[var(--glow-cyan)] to-transparent h-px" style="box-shadow: 0 1px 12px rgba(100,200,255,0.25);" />
            <!-- Label badge -->
            <div class="top-5 left-5 z-10 absolute flex items-center gap-2">
              <span class="bg-accented rounded-full w-1.5 h-1.5" />
              <span class="font-medium text-[10px] text-dimmed/70 uppercase tracking-widest">{{ $t('home.featureStreamgraph') }}</span>
            </div>
            <!-- Key metric overlay -->
            <div class="right-5 bottom-5 z-10 absolute flex items-baseline gap-2">
              <span class="font-bold tabular-nums text-highlighted text-4xl">
                <AnimatedCounter :target="atomTotalCommits" suffix="+" />
              </span>
              <span class="text-dimmed text-xs">{{ $t('home.statCommits') }}</span>
            </div>
            <!-- Chart — real atom/atom data -->
            <HeroStreamgraph :daily-data="atomDailyData" />
            <!-- Bottom fade -->
            <div class="absolute inset-0 bg-gradient-to-t from-default/30 to-transparent pointer-events-none" />
          </div>

          <!-- Row 2: Contributors (7 cols) + Health signals (5 cols) -->
          <!-- Contributors — real atom/atom data -->
          <div class="relative lg:col-span-7 bg-[var(--glass-bg)] backdrop-blur-md p-6 border border-[var(--glass-border)] rounded-2xl" style="box-shadow: var(--glass-inner), 0 10px 40px rgba(0,0,0,0.22);">
            <div class="top-0 right-6 left-6 absolute bg-gradient-to-r from-transparent via-[var(--glow-blue)] to-transparent h-px" style="box-shadow: 0 1px 12px rgba(100,160,255,0.25);" />
            <!-- Label + stat -->
            <div class="flex justify-between items-center mb-5">
              <div class="flex items-center gap-2">
                <span class="bg-blue-400 rounded-full w-1.5 h-1.5" />
                <span class="font-medium text-[10px] text-dimmed/70 uppercase tracking-widest">{{ $t('home.featureContributors') }}</span>
              </div>
              <div class="flex items-baseline gap-1.5">
                <span class="font-bold tabular-nums text-highlighted text-2xl">
                  <AnimatedCounter :target="atomStats[1]?.value ?? 0" suffix="+" />
                </span>
                <span class="text-[10px] text-dimmed">{{ $t('home.statContributors') }}</span>
              </div>
            </div>
            <!-- Bar chart — real top 5 contributors -->
            <div class="space-y-3">
              <div v-for="contributor in atomTopContributors" :key="contributor.name" class="flex items-center gap-3">
                <div class="w-20 tabular-nums text-dimmed text-xs text-right truncate">
                  {{ contributor.name }}
                </div>
                <div class="flex-1 border border-slate-300/50 dark:border-white/[0.05] rounded-full h-2 overflow-hidden" style="background: rgba(148,163,184,0.12);">
                  <div
                    class="rounded-full h-full"
                    :style="{ width: `${Math.round(contributor.commits / atomMaxContributorCommits * 100)}%`, background: 'linear-gradient(90deg, rgba(100,180,255,0.4) 0%, rgba(120,200,255,0.5) 100%)' }"
                  />
                </div>
                <div class="w-12 tabular-nums text-muted text-xs text-right">
                  {{ contributor.commits }}
                </div>
              </div>
            </div>
          </div>

          <!-- Health signals — real atom/atom data -->
          <div class="relative lg:col-span-5 bg-[var(--glass-bg)] backdrop-blur-md p-6 border border-[var(--glass-border)] rounded-2xl" style="box-shadow: var(--glass-inner), 0 10px 40px rgba(0,0,0,0.22);">
            <div class="top-0 right-6 left-6 absolute bg-gradient-to-r from-transparent via-[var(--glow-emerald)] to-transparent h-px" style="box-shadow: 0 1px 12px rgba(80,200,120,0.25);" />
            <!-- Label -->
            <div class="flex justify-between items-center mb-5">
              <div class="flex items-center gap-2">
                <span class="bg-emerald-400 rounded-full w-1.5 h-1.5" />
                <span class="font-medium text-[10px] text-dimmed/70 uppercase tracking-widest">{{ $t('home.featureHealth') }}</span>
              </div>
            </div>
            <!-- Signal list — real health signals from atom -->
            <div class="space-y-3">
              <div v-for="signal in atomHealthSignals" :key="signal.id" class="flex items-center gap-3">
                <div
                  class="rounded-full w-2 h-2 shrink-0"
                  :class="{
                    'bg-emerald-400': severityColor(signal.severity) === 'emerald',
                    'bg-amber-400': severityColor(signal.severity) === 'amber',
                    'bg-blue-400': severityColor(signal.severity) === 'blue',
                  }"
                  :style="{
                    boxShadow: severityColor(signal.severity) === 'emerald'
                      ? '0 0 6px rgba(80,200,120,0.4)'
                      : severityColor(signal.severity) === 'amber'
                        ? '0 0 6px rgba(250,180,50,0.35)'
                        : '0 0 6px rgba(100,160,255,0.35)',
                  }"
                />
                <div class="min-w-0">
                  <p class="text-dimmed text-xs truncate">
                    {{ $t(`health.${signal.id}`) }}
                  </p>
                  <p class="text-[10px] text-muted">
                    {{ signal.evidence }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Flowing section divider -->
    <div class="relative w-full h-[2px] overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--glow-blue)] to-transparent animate-flow" style="background-size: 200% 100%; box-shadow: 0 0 12px rgba(100,160,255,0.15);" />
    </div>

    <!-- Project List Section -->
    <section class="relative flex-1">
      <div class="absolute inset-0 bg-gradient-to-b from-default/50 via-default/30 to-default/50 pointer-events-none" />
      <div class="z-10 relative mx-auto px-6 lg:px-10 py-16 max-w-6xl">
        <div class="flex justify-between items-center mb-8">
          <div>
            <p class="mb-3 font-medium text-accented text-xs uppercase tracking-widest">
              {{ $t('home.projectsLabel') }}
            </p>
            <h2 class="font-bold text-highlighted text-3xl tracking-tight dark:[text-shadow:0_2px_12px_rgba(0,0,0,0.2)]">
              {{ $t('home.projects') }}
            </h2>
          </div>
          <span
            v-if="projects.length > 0 || (isStatic && demoProjects.length > 0)"
            class="tabular-nums text-muted text-sm"
          >
            {{ isStatic ? $t('home.projectCount', { count: demoProjects.length }) : $t('home.projectCount', { count: projects.length }) }}
          </span>
        </div>

        <!-- Loading -->
        <div
          v-if="projectsLoading || (isStatic && staticLoading)"
          class="py-16 text-center"
        >
          <div class="inline-flex items-center gap-3 text-muted text-sm">
            <span class="inline-block bg-accented rounded-full w-1.5 h-1.5 animate-pulse" />
            {{ $t('home.loadingProjects') }}
          </div>
        </div>

        <!-- Projects error -->
        <div
          v-else-if="projectsError"
          class="bg-red-950/30 p-4 border border-red-800/60 rounded-md text-red-300 text-sm"
        >
          {{ projectsError }}
        </div>

        <!-- Static mode: demo projects -->
        <template v-else-if="isStatic">
          <div v-if="demoProjects.length > 0" class="gap-4 grid sm:grid-cols-2">
            <ProjectCard
              v-for="project in demoProjects"
              :key="project.id"
              :project="project"
              :static-mode="true"
            />
          </div>
          <div v-else class="py-16 border border-default border-dashed rounded-xl text-center">
            <p class="text-dimmed text-sm">
              {{ $t('home.noProjects') }}
            </p>
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-else-if="projects.length === 0"
          class="bg-muted/20 py-16 border border-default border-dashed rounded-xl text-center"
        >
          <p class="text-dimmed text-sm">
            {{ $t('home.noProjects') }}
          </p>
          <p class="mt-1 text-muted text-xs">
            {{ $t('home.noProjectsHint') }}
          </p>
        </div>

        <!-- Project cards grid -->
        <div
          v-else
          class="gap-4 grid sm:grid-cols-2"
        >
          <ProjectCard
            v-for="project in projects"
            :key="project.id"
            :project="project"
            @reanalyze="handleReanalyze"
            @delete="handleDelete"
          />
        </div>
      </div>
    </section>

    <!-- Flowing section divider -->
    <div class="relative w-full h-[2px] overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent animate-flow" style="background-size: 200% 100%; box-shadow: 0 0 12px rgba(255,255,255,0.08);" />
    </div>

    <!-- Footer -->
    <footer class="relative py-8">
      <div class="absolute inset-0 bg-gradient-to-t from-default/80 via-default/50 to-transparent pointer-events-none" />
      <div class="z-10 relative mx-auto px-6 lg:px-10 max-w-6xl">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div class="flex justify-center items-center bg-accented/20 rounded-sm w-4 h-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-2.5 h-2.5 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12h20" />
                <path d="M2 12c2-4 4-6 6-6s4 4 6 4 4-4 6-4" />
                <path d="M2 12c2 4 4 6 6 6s4-4 6-4 4 4 6 4" />
              </svg>
            </div>
            <span class="text-muted text-xs">Project River</span>
          </div>
          <p class="text-muted text-xs">
            {{ $t('home.footer') }}
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
