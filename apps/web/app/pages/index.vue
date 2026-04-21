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

const demoProject = computed<Project | null>(() => {
  if (!staticBundle.value)
    return null
  const p = staticBundle.value.project
  return {
    id: p.id,
    name: p.name,
    fullName: p.fullName,
    status: p.status,
    lastAnalyzedAt: p.lastAnalyzedAt ? new Date(p.lastAnalyzedAt) : null,
  }
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

// Demo stats for static mode or empty state
const demoStats = [
  { value: 12473, labelKey: 'home.statCommits', suffix: '' },
  { value: 847, labelKey: 'home.statContributors', suffix: '' },
  { value: 2.4, labelKey: 'home.statYears', suffix: 'yr', decimals: 1 },
  { value: 156, labelKey: 'home.statFiles', suffix: '' },
]
</script>

<template>
  <div class="min-h-screen bg-default flex flex-col relative">
    <!-- Full-page Git River background -->
    <GitRiverCanvas />

    <!-- Navigation -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 border-b border-[var(--glass-border)] backdrop-blur-xl" style="background: var(--glass-bg); box-shadow: var(--glass-inner);"
    >
      <div class="max-w-6xl mx-auto px-6 lg:px-10 h-12 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-5 h-5 rounded-sm bg-accented/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12h20" />
              <path d="M2 12c2-4 4-6 6-6s4 4 6 4 4-4 6-4" />
              <path d="M2 12c2 4 4 6 6 6s4-4 6-4 4 4 6 4" />
            </svg>
          </div>
          <span class="text-sm font-semibold text-highlighted tracking-tight">Project River</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="p-1.5 text-muted hover:text-default hover:bg-elevated rounded-md transition-colors"
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
            class="px-2 py-1 text-xs font-medium text-muted hover:text-default hover:bg-elevated rounded-md transition-colors"
            @click="toggleLocale"
          >
            {{ locale === 'zh-CN' ? 'EN' : '中' }}
          </button>
        </div>
      </div>
    </nav>

    <!-- Hero Section - Fullscreen 100dvh -->
    <section class="relative min-h-[100dvh] flex items-center overflow-hidden">
      <!-- Background overlay for text readability over river -->
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-default/25 to-default/60 pointer-events-none" />

      <div class="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-20">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <!-- Left: 55% - Content -->
          <div class="lg:col-span-7">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md text-xs text-dimmed mb-6" style="box-shadow: var(--glass-inner), 0 2px 12px rgba(0,0,0,0.12);">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style="box-shadow: 0 0 6px rgba(52,211,153,0.4);" />
              {{ $t('home.tagline') }}
            </div>

            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-highlighted tracking-tighter leading-[1.1] dark:[text-shadow:0_2px_20px_rgba(0,0,0,0.3)]">
              Project River
            </h1>
            <p class="mt-5 text-base text-dimmed max-w-md leading-relaxed">
              {{ isStatic ? $t('home.subtitleStatic') : $t('home.subtitle') }}
            </p>

            <!-- URL Input CTA -->
            <form
              v-if="!isStatic"
              class="mt-8 flex gap-2 max-w-md"
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
            <div v-else class="mt-8">
              <NuxtLink
                :to="demoProject ? `/projects/${demoProject.id}` : '/'"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" style="box-shadow: var(--glass-inner), 0 4px 20px rgba(0,0,0,0.18), 0 0 24px rgba(100,180,255,0.10);"
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
              class="mt-4 flex items-center gap-3 text-sm text-dimmed"
            >
              <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {{ stageLabel }}
            </div>

            <!-- Error -->
            <div
              v-if="importStatus === 'error' && (errorGuidance || importError)"
              class="mt-4 max-w-md"
            >
              <div class="rounded-md border border-red-800/60 bg-red-950/30 p-4">
                <p class="text-sm font-medium text-red-300">
                  {{ errorGuidance?.title ? $t(errorGuidance.title) : $t('import.failed') }}
                </p>
                <p
                  v-if="errorGuidance?.hint"
                  class="mt-1 text-xs text-red-400/80"
                >
                  {{ errorGuidance.hintParams ? $t(errorGuidance.hint, errorGuidance.hintParams) : $t(errorGuidance.hint) }}
                </p>
                <p
                  v-else-if="importError"
                  class="mt-1 text-xs text-red-400/80"
                >
                  {{ importError }}
                </p>
                <button
                  class="mt-3 text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
                  @click="resetImport"
                >
                  {{ $t('common.tryAgain') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Right: 45% - Stats Grid -->
          <div class="lg:col-span-5">
            <div class="grid grid-cols-2 gap-3">
              <StatsCard
                v-for="(stat, i) in demoStats"
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
    <div class="relative h-[2px] w-full overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--glow-cyan)] to-transparent animate-flow" style="background-size: 200% 100%; box-shadow: 0 0 12px rgba(100,200,255,0.15);" />
    </div>

    <!-- Features - Zig-Zag alternating layout -->
    <section class="relative">
      <div class="absolute inset-0 bg-gradient-to-b from-default/50 via-default/30 to-default/50 pointer-events-none" />
      <div class="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-20">
        <!-- Section header -->
        <div class="mb-14">
          <p class="text-xs font-medium text-accented uppercase tracking-widest mb-2">
            {{ $t('home.featuresLabel') }}
          </p>
          <h2 class="text-2xl font-bold text-highlighted tracking-tight dark:[text-shadow:0_2px_12px_rgba(0,0,0,0.2)]">
            {{ $t('home.featuresTitle') }}
          </h2>
        </div>

        <!-- Zig-zag feature rows -->
        <div class="space-y-20">
          <!-- Feature 1: Streamgraph -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div class="lg:col-span-5">
              <div class="flex items-center gap-3 mb-4">
                <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm" style="box-shadow: var(--glass-inner), 0 2px 8px rgba(0,0,0,0.10);">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12h20" />
                    <path d="M2 12c2-4 4-6 6-6s4 4 6 4 4-4 6-4" />
                    <path d="M2 12c2 4 4 6 6 6s4-4 6-4 4 4 6 4" />
                  </svg>
                </div>
                <span class="text-xs font-medium text-dimmed/60 uppercase tracking-wider tabular-nums">01</span>
              </div>
              <h3 class="text-lg font-semibold text-highlighted mb-3">
                {{ $t('home.featureStreamgraph') }}
              </h3>
              <p class="text-sm text-dimmed leading-relaxed max-w-sm">
                {{ $t('home.featureStreamgraphDesc') }}
              </p>
              <div class="mt-5 flex items-baseline gap-2">
                <span class="text-3xl font-bold text-highlighted tabular-nums">
                  <AnimatedCounter :target="12473" />
                </span>
                <span class="text-xs text-dimmed">{{ $t('home.statCommits') }}</span>
              </div>
            </div>
            <div class="lg:col-span-7">
              <div class="relative rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md overflow-hidden aspect-[16/9]" style="box-shadow: var(--glass-inner), 0 8px 32px rgba(0,0,0,0.15);">
                <div class="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--glow-cyan)] to-transparent" style="box-shadow: 0 1px 12px rgba(100,200,255,0.25);" />
                <HeroStreamgraph />
                <div class="absolute inset-0 bg-gradient-to-t from-default/40 to-transparent" />
              </div>
            </div>
          </div>

          <!-- Feature 2: Contributors -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div class="lg:col-span-7 order-2 lg:order-1">
              <div class="relative rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-6" style="box-shadow: var(--glass-inner), 0 8px 32px rgba(0,0,0,0.15);">
                <div class="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--glow-blue)] to-transparent" style="box-shadow: 0 1px 12px rgba(100,160,255,0.25);" />
                <!-- Contributor mini-chart -->
                <div class="space-y-3">
                  <div v-for="(name, i) in ['antfu', 'posva', 'yyx990803', 'kiaking', 'danielroe']" :key="name" class="flex items-center gap-3">
                    <div class="w-20 text-xs text-dimmed text-right truncate">
                      {{ name }}
                    </div>
                    <div class="flex-1 h-2 rounded-full overflow-hidden border border-slate-300/50 dark:border-white/[0.05]" style="background: rgba(148,163,184,0.15); box-shadow: inset 0 1px 2px rgba(0,0,0,0.15);">
                      <div
                        class="h-full rounded-full relative"
                        :style="{ width: `${[38, 24, 18, 12, 8][i]}%`, background: 'linear-gradient(90deg, rgba(100,180,255,0.45) 0%, rgba(120,200,255,0.55) 50%, rgba(100,180,255,0.45) 100%)', boxShadow: '0 0 8px rgba(100,180,255,0.15)' }"
                      >
                        <div class="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                      </div>
                    </div>
                    <div class="w-12 text-xs text-muted tabular-nums text-right">
                      {{ [4738, 2984, 2239, 1493, 995][i] }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="lg:col-span-5 order-1 lg:order-2">
              <div class="flex items-center gap-3 mb-4">
                <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm" style="box-shadow: var(--glass-inner), 0 2px 8px rgba(0,0,0,0.10);">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <span class="text-xs font-medium text-dimmed/60 uppercase tracking-wider tabular-nums">02</span>
              </div>
              <h3 class="text-lg font-semibold text-highlighted mb-3">
                {{ $t('home.featureContributors') }}
              </h3>
              <p class="text-sm text-dimmed leading-relaxed max-w-sm">
                {{ $t('home.featureContributorsDesc') }}
              </p>
              <div class="mt-5 flex items-baseline gap-2">
                <span class="text-3xl font-bold text-highlighted tabular-nums">
                  <AnimatedCounter :target="847" />
                </span>
                <span class="text-xs text-dimmed">{{ $t('home.statContributors') }}</span>
              </div>
            </div>
          </div>

          <!-- Feature 3: Health -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div class="lg:col-span-5">
              <div class="flex items-center gap-3 mb-4">
                <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm" style="box-shadow: var(--glass-inner), 0 2px 8px rgba(0,0,0,0.10);">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <span class="text-xs font-medium text-dimmed/60 uppercase tracking-wider tabular-nums">03</span>
              </div>
              <h3 class="text-lg font-semibold text-highlighted mb-3">
                {{ $t('home.featureHealth') }}
              </h3>
              <p class="text-sm text-dimmed leading-relaxed max-w-sm">
                {{ $t('home.featureHealthDesc') }}
              </p>
              <div class="mt-5 flex items-baseline gap-2">
                <span class="text-3xl font-bold text-highlighted tabular-nums">
                  <AnimatedCounter :target="94" suffix="%" />
                </span>
                <span class="text-xs text-dimmed">{{ $t('home.statHealthScore') }}</span>
              </div>
            </div>
            <div class="lg:col-span-7">
              <div class="relative rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-6" style="box-shadow: var(--glass-inner), 0 8px 32px rgba(0,0,0,0.15);">
                <div class="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--glow-emerald)] to-transparent" style="box-shadow: 0 1px 12px rgba(80,200,120,0.25);" />
                <!-- Health signals mini -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex items-center gap-3 p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.01]" style="box-shadow: var(--glass-inner);">
                    <div class="w-2 h-2 rounded-full bg-emerald-400" style="box-shadow: 0 0 6px rgba(80,200,120,0.4);" />
                    <div>
                      <p class="text-xs text-dimmed">
                        {{ $t('health.sustainedActivity') }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ $t('health.sustainedActivityEvidenceToday') }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.01]" style="box-shadow: var(--glass-inner);">
                    <div class="w-2 h-2 rounded-full bg-amber-400" style="box-shadow: 0 0 6px rgba(250,180,50,0.35);" />
                    <div>
                      <p class="text-xs text-dimmed">
                        {{ $t('health.concentration') }}
                      </p>
                      <p class="text-xs text-muted">
                        Top 3: 38%
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.01]" style="box-shadow: var(--glass-inner);">
                    <div class="w-2 h-2 rounded-full bg-emerald-400" style="box-shadow: 0 0 6px rgba(80,200,120,0.4);" />
                    <div>
                      <p class="text-xs text-dimmed">
                        {{ $t('health.distributionGrowth') }}
                      </p>
                      <p class="text-xs text-muted">
                        +12% QoQ
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.01]" style="box-shadow: var(--glass-inner);">
                    <div class="w-2 h-2 rounded-full bg-emerald-400" style="box-shadow: 0 0 6px rgba(80,200,120,0.4);" />
                    <div>
                      <p class="text-xs text-dimmed">
                        {{ $t('health.codeChurn') }}
                      </p>
                      <p class="text-xs text-muted">
                        142 lines/commit
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Flowing section divider -->
    <div class="relative h-[2px] w-full overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--glow-blue)] to-transparent animate-flow" style="background-size: 200% 100%; box-shadow: 0 0 12px rgba(100,160,255,0.15);" />
    </div>

    <!-- Project List Section -->
    <section class="relative flex-1">
      <div class="absolute inset-0 bg-gradient-to-b from-default/50 via-default/30 to-default/50 pointer-events-none" />
      <div class="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-16">
        <div class="flex items-center justify-between mb-8">
          <div>
            <p class="text-xs font-medium text-accented uppercase tracking-widest mb-2">
              {{ $t('home.projectsLabel') }}
            </p>
            <h2 class="text-2xl font-bold text-highlighted tracking-tight dark:[text-shadow:0_2px_12px_rgba(0,0,0,0.2)]">
              {{ $t('home.projects') }}
            </h2>
          </div>
          <span
            v-if="projects.length > 0 || (isStatic && demoProject)"
            class="text-sm text-muted tabular-nums"
          >
            {{ isStatic ? $t('home.projectCount', { count: 1 }) : $t('home.projectCount', { count: projects.length }) }}
          </span>
        </div>

        <!-- Loading -->
        <div
          v-if="projectsLoading || (isStatic && staticLoading)"
          class="py-16 text-center"
        >
          <div class="inline-flex items-center gap-3 text-sm text-muted">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accented" />
            {{ $t('home.loadingProjects') }}
          </div>
        </div>

        <!-- Projects error -->
        <div
          v-else-if="projectsError"
          class="rounded-md border border-red-800/60 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {{ projectsError }}
        </div>

        <!-- Static mode: demo project -->
        <template v-else-if="isStatic">
          <div v-if="demoProject" class="grid gap-4 sm:grid-cols-2">
            <ProjectCard
              :project="demoProject"
              :static-mode="true"
            />
          </div>
          <div v-else class="rounded-xl border border-dashed border-default py-16 text-center">
            <p class="text-sm text-dimmed">
              {{ $t('home.noProjects') }}
            </p>
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-else-if="projects.length === 0"
          class="rounded-xl border border-dashed border-default bg-muted/20 py-16 text-center"
        >
          <p class="text-sm text-dimmed">
            {{ $t('home.noProjects') }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ $t('home.noProjectsHint') }}
          </p>
        </div>

        <!-- Project cards grid -->
        <div
          v-else
          class="grid gap-4 sm:grid-cols-2"
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
    <div class="relative h-[2px] w-full overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--flow-line-base)] to-transparent animate-flow" style="background-size: 200% 100%; box-shadow: 0 0 12px rgba(255,255,255,0.08);" />
    </div>

    <!-- Footer -->
    <footer class="relative py-8">
      <div class="absolute inset-0 bg-gradient-to-t from-default/80 via-default/50 to-transparent pointer-events-none" />
      <div class="relative z-10 max-w-6xl mx-auto px-6 lg:px-10">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-sm bg-accented/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-2.5 h-2.5 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12h20" />
                <path d="M2 12c2-4 4-6 6-6s4 4 6 4 4-4 6-4" />
                <path d="M2 12c2 4 4 6 6 6s4-4 6-4 4 4 6 4" />
              </svg>
            </div>
            <span class="text-xs text-muted">Project River</span>
          </div>
          <p class="text-xs text-muted">
            {{ $t('home.footer') }}
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
