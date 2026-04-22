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

/** 本地项目显示目录名（name），GitHub 项目显示 fullName */
const displayName = computed(() => {
  if (props.project.fullName?.startsWith('local:'))
    return props.project.name
  return props.project.fullName || props.project.name
})

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
    class="group relative bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] hover:border-accented/50 rounded-2xl overflow-hidden transition-all duration-300"
    style="box-shadow: var(--glass-inner), 0 10px 40px rgba(0,0,0,0.22);"
  >
    <!-- Top glow line -->
    <div
      class="top-0 right-6 left-6 absolute bg-gradient-to-r from-transparent via-[var(--glow-cyan)] to-transparent h-px"
      style="box-shadow: 0 1px 12px rgba(100,200,255,0.25);"
    />

    <!-- Clickable area for navigation -->
    <NuxtLink
      :to="`/projects/${project.id}`"
      class="block z-10 relative p-6"
    >
      <div class="flex justify-between items-start gap-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-medium text-highlighted text-sm truncate">
            {{ displayName }}
          </h3>
          <p
            v-if="project.fullName && project.name !== project.fullName"
            class="mt-0.5 text-dimmed text-xs truncate"
          >
            {{ project.name }}
          </p>
        </div>

        <!-- Status indicator -->
        <div class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="isInProgress"
            class="inline-block bg-amber-400 rounded-full w-1.5 h-1.5 animate-pulse"
          />
          <span
            v-else-if="project.status === 'ready'"
            class="inline-block bg-emerald-400 rounded-full w-1.5 h-1.5"
          />
          <span
            v-else-if="project.status === 'error'"
            class="inline-block bg-red-400 rounded-full w-1.5 h-1.5"
          />
          <span class="text-xs" :class="[statusColor]">
            {{ statusLabel }}
          </span>
        </div>
      </div>

      <div
        v-if="formattedDate"
        class="mt-2 text-dimmed text-xs"
      >
        {{ $t('project.analyzed', { time: formattedDate }) }}
      </div>
    </NuxtLink>

    <!-- Action buttons — visible on hover (hidden in static mode) -->
    <div
      v-if="!staticMode"
      class="z-10 relative flex items-center gap-2 opacity-0 group-hover:opacity-100 p-3 border-[var(--glass-border)] border-t transition-opacity"
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
      :description="$t('dialog.deleteDescription', { name: displayName })"
      :confirm-label="$t('common.delete')"
      confirm-color="error"
      :loading="isDeleting"
      @confirm="handleDelete"
    />
    <ConfirmDialog
      v-if="!staticMode"
      v-model:open="reanalyzeDialogOpen"
      :title="$t('dialog.reanalyzeTitle')"
      :description="$t('dialog.reanalyzeDescription', { name: displayName })"
      :confirm-label="$t('common.reanalyze')"
      confirm-color="warning"
      :loading="isReanalyzing"
      @confirm="handleReanalyze"
    />
  </div>
</template>
