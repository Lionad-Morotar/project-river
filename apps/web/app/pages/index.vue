<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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
const settingsModalOpen = ref(false)

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

/** Brief summary per demo project for modal cards */
interface ProjectSummary {
  id: number
  name: string
  fullName: string | null
  commits: number
  contributors: number
  yearSpan: string
}

const demoProjectSummaries = computed<ProjectSummary[]>(() => {
  if (!staticBundle.value)
    return []
  return staticBundle.value.projects.map((bundle) => {
    const daily = bundle.daily
    let totalCommits = 0
    const contributorSet = new Set<string>()
    let minYear = Infinity
    let maxYear = -Infinity
    for (const d of daily) {
      totalCommits += d.commits
      contributorSet.add(d.contributor)
      const y = new Date(d.date).getFullYear()
      if (y < minYear)
        minYear = y
      if (y > maxYear)
        maxYear = y
    }
    const yearSpan = daily.length > 0 ? `${minYear}–${maxYear}` : ''
    return {
      id: bundle.project.id,
      name: bundle.project.name,
      fullName: bundle.project.fullName,
      commits: totalCommits,
      contributors: contributorSet.size,
      yearSpan,
    }
  })
})

/** Submit URL for import */
async function handleSubmit() {
  if (!canSubmit.value)
    return
  await importRepo(url.value)
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
</script>

<template>
  <div class="relative flex flex-col bg-default min-h-screen">
    <!-- Full-page Git River background -->
    <GitRiverCanvas />

    <!-- Top-right controls: theme + locale -->
    <div class="top-4 right-6 z-50 fixed flex items-center gap-1">
      <button
        class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
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
        class="hover:bg-elevated px-2 py-1 rounded-md font-medium text-muted hover:text-default text-xs transition-colors"
        @click="toggleLocale"
      >
        {{ locale === 'zh-CN' ? 'EN' : '中' }}
      </button>
      <!-- Settings -->
      <button
        class="hover:bg-elevated p-1.5 rounded-md text-muted hover:text-default transition-colors"
        :aria-label="$t('settings.title')"
        @click="settingsModalOpen = true"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>

    <!-- Settings modal -->
    <SettingsModal v-model:open="settingsModalOpen" />

    <!-- Hero Section - Fullscreen 100dvh -->
    <section class="relative flex items-center min-h-[100dvh] overflow-hidden">
      <!-- Background overlay for text readability over river -->
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-default/30 to-default/80 pointer-events-none" />

      <div class="z-20 relative mx-auto -mt-[25%] px-6 lg:px-10 py-24 w-full max-w-6xl">
        <!-- Tagline badge -->
        <div class="hero-enter hero-enter-1">
          <div class="inline-flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-md px-4 py-1.5 border border-[var(--glass-border)] rounded-full text-toned text-xs" style="box-shadow: var(--glass-inner), 0 2px 12px rgba(0,0,0,0.12);">
            <span class="bg-emerald-400 rounded-full w-1.5 h-1.5 animate-pulse" style="box-shadow: 0 0 6px rgba(52,211,153,0.4);" />
            {{ $t('home.tagline') }}
          </div>
        </div>

        <!-- H1 -- Plus Jakarta Sans Medium 500 Italic -->
        <h1 class="mt-6 font-['Plus_Jakarta_Sans'] font-medium text-highlighted text-8xl sm:text-8xl lg:text-9xl italic leading-[0.95] tracking-lighter hero-enter hero-enter-2 dark:[text-shadow:0_4px_30px_rgba(0,0,0,0.4)]">
          Project<br>River
        </h1>

        <!-- Subtitle + Form row -->
        <div class="items-start gap-8 lg:gap-12 grid grid-cols-1 lg:grid-cols-12 mt-10 lg:mt-12">
          <!-- Left column: description + CTA -->
          <div class="lg:col-span-7">
            <p class="inline-flex bg-[color-mix(in_srgb,var(--ui-bg),transparent_30%)] pl-1 text-toned text-lg leading-relaxed hero-enter hero-enter-3">
              {{ isStatic ? $t('home.subtitleStatic') : $t('home.subtitle') }}
            </p>

            <!-- URL Input + dual-purpose button -->
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
              <!-- "项目库" when empty, "导入" when has input -->
              <UButton
                v-if="url.trim().length === 0 && !isImportActive"
                type="button"
                size="lg"
                icon="i-lucide-layers"
                trailing
                @click="navigateTo(`/projects/${demoProjects[0]?.id ?? 1}`)"
              >
                {{ $t('home.viewExample') }}
              </UButton>
              <UButton
                v-else
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

            <!-- Static mode CTA: select project via modal -->
            <div v-else class="mt-8 hero-enter hero-enter-3">
              <UModal>
                <button
                  class="inline-flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-md px-7 py-3 border border-[var(--glass-border)] rounded-lg font-medium text-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                  style="box-shadow: var(--glass-inner), 0 6px 28px rgba(0,0,0,0.22), 0 0 32px rgba(100,180,255,0.12);"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  {{ $t('home.selectDemo') }}
                </button>

                <template #content>
                  <div class="p-6">
                    <h3 class="font-medium text-highlighted text-lg mb-4">
                      {{ $t('home.selectDemo') }}
                    </h3>
                    <div class="space-y-3">
                      <NuxtLink
                        v-for="p in demoProjectSummaries"
                        :key="p.id"
                        :to="`/projects/${p.id}`"
                        class="group flex items-center gap-4 bg-[var(--glass-bg)] backdrop-blur-md p-4 border border-[var(--glass-border)] rounded-xl hover:border-accented/50 transition-all duration-300"
                        style="box-shadow: var(--glass-inner);"
                      >
                        <span class="inline-block bg-emerald-400 rounded-full w-2 h-2 shrink-0 mt-0.5" />
                        <div class="flex-1 min-w-0">
                          <span class="font-medium text-highlighted text-sm truncate block">{{ p.fullName || p.name }}</span>
                          <span class="text-muted text-xs mt-0.5 block">{{ p.commits.toLocaleString() }} commits · {{ p.contributors }} contributors · {{ p.yearSpan }}</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-muted group-hover:text-accented transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </NuxtLink>
                    </div>
                  </div>
                </template>
              </UModal>
            </div>

            <!-- Import progress -->
            <div
              v-if="isImportActive"
              class="flex items-center gap-3 mt-4 text-toned text-sm"
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
        </div>
      </div>
    </section>
  </div>
</template>
