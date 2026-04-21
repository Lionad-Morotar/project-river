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
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function toggleLocale() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
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
</script>

<template>
  <div class="min-h-screen bg-default flex flex-col">
    <!-- Floating controls -->
    <div class="fixed top-4 right-4 z-50 flex items-center gap-1">
      <button
        class="p-1.5 text-muted hover:text-default hover:bg-elevated rounded-md transition-colors backdrop-blur-sm bg-default/50"
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
        class="px-2 py-1 text-xs font-medium text-muted hover:text-default hover:bg-elevated rounded-md transition-colors backdrop-blur-sm bg-default/50"
        @click="toggleLocale"
      >
        {{ locale === 'zh-CN' ? 'English' : '简体中文' }}
      </button>
    </div>

    <!-- Hero Section -->
    <section class="relative overflow-hidden">
      <!-- Ambient streamgraph background -->
      <div class="absolute inset-0">
        <HeroStreamgraph />
      </div>

      <!-- Gradient overlays for text readability -->
      <div class="absolute inset-0 bg-gradient-to-b from-default/70 via-default/50 to-default pointer-events-none" />

      <div class="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pt-20 pb-16 text-center">
        <!-- Title -->
        <h1 class="text-4xl sm:text-5xl font-bold text-highlighted tracking-tight">
          Project River
        </h1>
        <p class="mt-4 text-base sm:text-lg text-dimmed max-w-lg mx-auto leading-relaxed">
          {{ isStatic ? $t('home.subtitleStatic') : $t('home.subtitle') }}
        </p>

        <!-- URL Input CTA (server mode only) -->
        <form
          v-if="!isStatic"
          class="mt-8 flex gap-2 max-w-xl mx-auto"
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

        <!-- Static mode: CTA to demo -->
        <div v-else class="mt-8 flex justify-center">
          <NuxtLink
            :to="demoProject ? `/projects/${demoProject.id}` : '/'"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {{ $t('home.viewDemo') }}
          </NuxtLink>
        </div>

        <!-- Import progress indicator -->
        <div
          v-if="isImportActive"
          class="mt-4 flex items-center justify-center gap-3 text-sm text-dimmed"
        >
          <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          {{ stageLabel }}
        </div>

        <!-- Error display -->
        <div
          v-if="importStatus === 'error' && (errorGuidance || importError)"
          class="mt-4 max-w-xl mx-auto"
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
    </section>

    <!-- Features Section -->
    <section class="border-t border-default bg-muted/30">
      <div class="max-w-5xl mx-auto px-6 lg:px-10 py-14">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <!-- Feature 1: Streamgraph -->
          <div class="text-center sm:text-left">
            <div class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-elevated border border-default mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12h20" />
                <path d="M2 12c2-4 4-6 6-6s4 4 6 4 4-4 6-4" />
                <path d="M2 12c2 4 4 6 6 6s4-4 6-4 4 4 6 4" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-default">
              {{ $t('home.featureStreamgraph') }}
            </h3>
            <p class="mt-1.5 text-sm text-dimmed leading-relaxed">
              {{ $t('home.featureStreamgraphDesc') }}
            </p>
          </div>

          <!-- Feature 2: Contributors -->
          <div class="text-center sm:text-left">
            <div class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-elevated border border-default mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-default">
              {{ $t('home.featureContributors') }}
            </h3>
            <p class="mt-1.5 text-sm text-dimmed leading-relaxed">
              {{ $t('home.featureContributorsDesc') }}
            </p>
          </div>

          <!-- Feature 3: Health -->
          <div class="text-center sm:text-left">
            <div class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-elevated border border-default mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accented" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-default">
              {{ $t('home.featureHealth') }}
            </h3>
            <p class="mt-1.5 text-sm text-dimmed leading-relaxed">
              {{ $t('home.featureHealthDesc') }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Project List Section -->
    <section class="flex-1">
      <div class="max-w-3xl mx-auto px-6 lg:px-10 py-12">
        <div class="mb-5 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-default">
            {{ $t('home.projects') }}
          </h2>
          <span
            v-if="projects.length > 0 || (isStatic && demoProject)"
            class="text-xs text-muted"
          >
            {{ isStatic ? $t('home.projectCount', { count: 1 }) : $t('home.projectCount', { count: projects.length }) }}
          </span>
        </div>

        <!-- Loading -->
        <div
          v-if="projectsLoading || (isStatic && staticLoading)"
          class="py-10 text-center text-sm text-muted"
        >
          {{ $t('home.loadingProjects') }}
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
          <div v-if="demoProject" class="grid gap-3 sm:grid-cols-2">
            <ProjectCard
              :project="demoProject"
              :static-mode="true"
            />
          </div>
          <div v-else class="rounded-lg border border-dashed border-default py-12 text-center">
            <p class="text-sm text-dimmed">
              {{ $t('home.noProjects') }}
            </p>
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-else-if="projects.length === 0"
          class="rounded-lg border border-dashed border-default bg-muted/20 py-12 text-center"
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
          class="grid gap-3 sm:grid-cols-2"
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

    <!-- Footer -->
    <footer class="border-t border-default py-6">
      <div class="max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <p class="text-xs text-muted">
          Project River — {{ $t('home.footer') }}
        </p>
      </div>
    </footer>
  </div>
</template>
