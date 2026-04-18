<script setup lang="ts">
import ProjectCard from '~/components/ProjectCard.vue'
import { useProjectImport } from '~/composables/useProjectImport'
import { getErrorGuidance } from '~/utils/errorGuidance'

interface Project {
  id: number
  name: string
  fullName: string | null
  status: string
  lastAnalyzedAt: Date | null
}

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

/** Fetch project list */
async function fetchProjects() {
  projectsLoading.value = true
  projectsError.value = null
  try {
    const data = await $fetch<Project[]>('/api/projects')
    projects.value = data
  }
  catch {
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
  <div class="min-h-screen bg-slate-950 flex flex-col">
    <div class="max-w-3xl mx-auto px-6 lg:px-10 py-16 flex flex-col flex-1 w-full">
      <!-- Header -->
      <header class="mb-12 text-center">
        <h1 class="text-2xl font-semibold text-slate-100 tracking-tight">
          {{ $t('home.title') }}
        </h1>
        <p class="mt-2 text-sm text-slate-400">
          {{ $t('home.subtitle') }}
        </p>
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
          class="mt-4 flex items-center gap-3 text-sm text-slate-400"
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
          <h2 class="text-sm font-medium text-slate-300">
            {{ $t('home.projects') }}
          </h2>
          <span
            v-if="projects.length > 0"
            class="text-xs text-slate-500"
          >
            {{ $t('home.projectCount', { count: projects.length }) }}
          </span>
        </div>

        <!-- Loading -->
        <div
          v-if="projectsLoading"
          class="py-8 text-center text-sm text-slate-500"
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
          class="rounded-lg border border-dashed border-slate-800 py-12 text-center"
        >
          <p class="text-sm text-slate-400">
            {{ $t('home.noProjects') }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
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
