<script setup lang="ts">
interface Project {
  id: number
  name: string
  fullName: string | null
  status: string
  lastAnalyzedAt: Date | null
}

const props = defineProps<{
  project: Project
}>()

const emit = defineEmits<{
  (e: 'reanalyze', id: number): void
  (e: 'delete', id: number): void
}>()

const isDeleting = ref(false)
const isReanalyzing = ref(false)

const statusColor = computed(() => {
  switch (props.project.status) {
    case 'ready':
      return 'text-emerald-400'
    case 'cloning':
    case 'analyzing':
      return 'text-amber-400'
    case 'error':
      return 'text-red-400'
    default:
      return 'text-slate-500'
  }
})

const statusLabel = computed(() => {
  switch (props.project.status) {
    case 'ready':
      return 'Ready'
    case 'cloning':
      return 'Cloning'
    case 'analyzing':
      return 'Analyzing'
    case 'error':
      return 'Error'
    default:
      return props.project.status
  }
})

const formattedDate = computed(() => {
  if (!props.project.lastAnalyzedAt)
    return null
  return new Date(props.project.lastAnalyzedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})

const isInProgress = computed(() =>
  props.project.status === 'cloning' || props.project.status === 'analyzing',
)

async function handleDelete() {
  if (isDeleting.value)
    return
  isDeleting.value = true
  emit('delete', props.project.id)
}

async function handleReanalyze() {
  if (isReanalyzing.value)
    return
  isReanalyzing.value = true
  emit('reanalyze', props.project.id)
}
</script>

<template>
  <div
    class="group relative rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800/60"
  >
    <!-- Clickable area for navigation -->
    <NuxtLink
      :to="`/projects/${project.id}`"
      class="block"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-sm font-medium text-slate-100">
            {{ project.fullName || project.name }}
          </h3>
          <p
            v-if="project.fullName && project.name !== project.fullName"
            class="mt-0.5 truncate text-xs text-slate-500"
          >
            {{ project.name }}
          </p>
        </div>

        <!-- Status indicator -->
        <div class="flex shrink-0 items-center gap-1.5">
          <span
            v-if="isInProgress"
            class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
          />
          <span
            v-else-if="project.status === 'ready'"
            class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
          />
          <span
            v-else-if="project.status === 'error'"
            class="inline-block h-1.5 w-1.5 rounded-full bg-red-400"
          />
          <span class="text-xs" :class="[statusColor]">
            {{ statusLabel }}
          </span>
        </div>
      </div>

      <div
        v-if="formattedDate"
        class="mt-2 text-xs text-slate-500"
      >
        Analyzed {{ formattedDate }}
      </div>
    </NuxtLink>

    <!-- Action buttons — visible on hover -->
    <div class="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-refresh-cw"
        :loading="isReanalyzing"
        :disabled="isInProgress"
        @click.prevent="handleReanalyze"
      >
        Re-analyze
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="error"
        icon="i-lucide-trash-2"
        :loading="isDeleting"
        @click.prevent="handleDelete"
      />
    </div>
  </div>
</template>
