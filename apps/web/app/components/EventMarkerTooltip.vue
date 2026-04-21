<script setup lang="ts">
import type { ProjectEvent } from '~/composables/useProjectEvents'

interface Props {
  visible: boolean
  x: number
  y: number
  event: ProjectEvent | null
}

defineProps<Props>()

function severityDotClass(severity: string): string {
  switch (severity) {
    case 'positive': return 'bg-emerald-400'
    case 'warning': return 'bg-amber-400'
    case 'info': return 'bg-sky-400'
    default: return 'bg-dimmed'
  }
}

function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '.')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-100"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible && event"
        class="fixed z-50 bg-elevated border border-default rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
        :style="{ left: `${x}px`, top: `${y}px` }"
      >
        <div class="flex items-center gap-2 mb-1.5">
          <span
            class="rounded-full w-2 h-2 flex-shrink-0"
            :class="severityDotClass(event.severity)"
          />
          <span class="text-xs font-medium text-default">
            {{ $t(event.titleKey) }}
          </span>
        </div>
        <div class="text-[10px] text-muted mb-1 tabular-nums">
          {{ formatDate(event.date) }}
        </div>
        <p class="text-[11px] text-dimmed leading-relaxed">
          {{ $t(event.descriptionKey, event.params) }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>
