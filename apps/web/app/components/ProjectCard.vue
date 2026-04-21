<script setup lang="ts">
const props = defineProps<{
  project: Project
  staticMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'reanalyze', id: number): void
  (e: 'delete', id: number): void
}>()

const { t } = useI18n()

interface Project {
  id: number
  name: string
  fullName: string | null
  status: string
  lastAnalyzedAt: string | null
}

const isDeleting = ref(false)
const isReanalyzing = ref(false)
const deleteDialogOpen = ref(false)
const reanalyzeDialogOpen = ref(false)

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
      return 'text-dimmed'
  }
})

const statusLabel = computed(() => {
  switch (props.project.status) {
    case 'ready':
      return t('status.ready')
    case 'cloning':
      return t('status.cloning')
    case 'analyzing':
      return t('status.analyzing')
    case 'error':
      return t('status.error')
    default:
      return props.project.status
  }
})

const { formatShortDate } = useLocale()

const formattedDate = computed(() => {
  if (!props.project.lastAnalyzedAt)
    return null
  return formatShortDate(props.project.lastAnalyzedAt)
})

const isInProgress = computed(() =>
  props.project.status === 'cloning' || props.project.status === 'analyzing',
)

async function handleDelete() {
  deleteDialogOpen.value = false
  if (isDeleting.value)
    return
  isDeleting.value = true
  emit('delete', props.project.id)
}

async function handleReanalyze() {
  reanalyzeDialogOpen.value = false
  if (isReanalyzing.value)
    return
  isReanalyzing.value = true
  emit('reanalyze', props.project.id)
}
</script>

<template>
  <div
    class="group relative rounded-lg border border-default bg-muted p-4 transition-colors hover:border-accented hover:bg-elevated/60"
  >
    <!-- Clickable area for navigation -->
    <NuxtLink
      :to="`/projects/${project.id}`"
      class="block"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-sm font-medium text-highlighted">
            {{ project.fullName || project.name }}
          </h3>
          <p
            v-if="project.fullName && project.name !== project.fullName"
            class="mt-0.5 truncate text-xs text-dimmed"
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
        class="mt-2 text-xs text-dimmed"
      >
        {{ $t('project.analyzed', { time: formattedDate }) }}
      </div>
    </NuxtLink>

    <!-- Action buttons — visible on hover (hidden in static mode) -->
    <div
      v-if="!staticMode"
      class="mt-3 flex items-center gap-2 border-t border-default pt-3 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-refresh-cw"
        :loading="isReanalyzing"
        :disabled="isInProgress"
        @click.prevent="reanalyzeDialogOpen = true"
      >
        {{ $t('common.reanalyze') }}
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="error"
        icon="i-lucide-trash-2"
        :loading="isDeleting"
        @click.prevent="deleteDialogOpen = true"
      />
    </div>

    <!-- Confirm dialogs -->
    <ConfirmDialog
      v-if="!staticMode"
      v-model:open="deleteDialogOpen"
      :title="$t('dialog.deleteTitle')"
      :description="$t('dialog.deleteDescription', { name: project.fullName || project.name })"
      :confirm-label="$t('common.delete')"
      confirm-color="error"
      :loading="isDeleting"
      @confirm="handleDelete"
    />
    <ConfirmDialog
      v-if="!staticMode"
      v-model:open="reanalyzeDialogOpen"
      :title="$t('dialog.reanalyzeTitle')"
      :description="$t('dialog.reanalyzeDescription', { name: project.fullName || project.name })"
      :confirm-label="$t('common.reanalyze')"
      confirm-color="warning"
      :loading="isReanalyzing"
      @confirm="handleReanalyze"
    />
  </div>
</template>
