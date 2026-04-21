<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ProjectCard from '~/components/ProjectCard.vue'
import { useProjectImport } from '~/composables/useProjectImport'
import { getErrorGuidance } from '~/utils/errorGuidance'

interface Project {
  id: number
  name: string
  fullName: string | null
  status: string
  lastAnalyzedAt: string | null
}

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
  fetchProjects()
})

/** Submit URL for import */
async function handleSubmit() {
  if (!canSubmit.value)
    return

  const result = await importRepo(url.value)

  if (result.success) {
    // Import started or redirected — refresh list on next visit
    return
  }

  // Import failed — refresh project list in case a new error-status project was created
  await fetchProjects()
}

/** Re-analyze an existing project */
async function handleReanalyze(projectId: number) {
  try {
    await $fetch(`/api/projects/${projectId}/reanalyze`, { method: 'POST' })
    await fetchProjects()
  }
  catch {
    // Silently refresh — the card will show the current state
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
    // Refresh to get accurate state
    await fetchProjects()
  }
}

/** Get human-friendly error guidance based on error prefix */
const errorGuidance = computed(() => getErrorGuidance(importError.value))
</script>

<template>
  <div class="min-h-screen bg-default flex flex-col">
    <div class="max-w-3xl mx-auto px-6 lg:px-10 py-16 flex flex-col flex-1 w-full">
      <!-- Header -->
      <header class="mb-12">
        <div class="flex items-start justify-between gap-4">
          <div class="text-center flex-1">
            <h1 class="text-2xl font-semibold text-highlighted tracking-tight">
              {{ $t('home.title') }}
            </h1>
            <p class="mt-2 text-sm text-dimmed">
              {{ $t('home.subtitle') }}
            </p>
          </div>
          <!-- Theme & Locale toggles -->
          <div class="shrink-0 flex items-center gap-1">
            <button
              class="p-1.5 text-muted hover:text-default hover:bg-elevated rounded-md transition-colors"
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
              class="px-2 py-1 text-xs font-medium text-muted hover:text-default hover:bg-elevated rounded-md transition-colors"
              @click="toggleLocale"
            >
              {{ locale === 'zh-CN' ? 'English' : '简体中文' }}
            </button>
          </div>
        </div>
      </header>

      <!-- URL Input -->
      <section class="mb-12">
        <form
          class="flex gap-2"
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

        <!-- Import progress indicator -->
        <div
          v-if="isImportActive"
          class="mt-4 flex items-center gap-3 text-sm text-dimmed"
        >
          <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          {{ stageLabel }}
        </div>

        <!-- Error display -->
        <div
          v-if="importStatus === 'error' && (errorGuidance || importError)"
          class="mt-4"
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
      </section>

      <!-- Project List -->
      <section>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-medium text-default">
            {{ $t('home.projects') }}
          </h2>
          <span
            v-if="projects.length > 0"
            class="text-xs text-muted"
          >
            {{ $t('home.projectCount', { count: projects.length }) }}
          </span>
        </div>

        <!-- Loading -->
        <div
          v-if="projectsLoading"
          class="py-8 text-center text-sm text-muted"
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

        <!-- Empty state -->
        <div
          v-else-if="projects.length === 0"
          class="rounded-lg border border-dashed border-default py-12 text-center"
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
      </section>
    </div>
  </div>
</template>
