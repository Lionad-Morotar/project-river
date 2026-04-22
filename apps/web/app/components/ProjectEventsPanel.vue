<script setup lang="ts">
import type { EventSeverity, ProjectEvent } from '~/composables/useProjectEvents'

interface Props {
  events: ProjectEvent[]
  totalEvents: number
  loading: boolean
  visibleRange?: { start: string, end: string } | null
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'hoverEvent', event: ProjectEvent | null): void
}>()

const isExpanded = ref(true)

function severityDotClass(severity: EventSeverity): string {
  switch (severity) {
    case 'positive': return 'bg-emerald-400'
    case 'warning': return 'bg-amber-400'
    case 'info': return 'bg-sky-400'
    default: return 'bg-dimmed'
  }
}

function severityTextClass(severity: EventSeverity): string {
  switch (severity) {
    case 'positive': return 'text-emerald-400'
    case 'warning': return 'text-amber-400'
    case 'info': return 'text-sky-400'
    default: return 'text-dimmed'
  }
}

function formatDate(dateStr: string): string {
  // YYYY-MM-DD → YYYY.MM.DD
  return dateStr.replace(/-/g, '.')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <button
      class="flex justify-between items-center hover:bg-elevated/50 mt-2.5 px-4 py-2.5 border-default border-b w-full transition-colors"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-2">
        <span
          class="font-semibold text-xs uppercase tracking-wider"
          :class="loading ? 'text-dimmed' : 'text-highlighted'"
        >
          <template v-if="loading">
            {{ $t('events.panel.loading') }}
          </template>
          <template v-else>
            {{ $t('events.panel.title', { count: totalEvents }) }}
          </template>
        </span>
        <span
          v-if="visibleRange && !loading"
          class="text-[10px] text-dimmed"
        >
          ({{ events.length }} / {{ totalEvents }})
        </span>
      </div>
      <span
        class="text-muted transition-transform duration-200"
        :class="isExpanded ? 'rotate-180' : ''"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>

    <!-- Loading state -->
    <div
      v-if="loading && isExpanded"
      class="flex items-center gap-2 px-4 py-4 text-dimmed text-xs"
    >
      <span class="inline-block bg-sky-400/60 rounded-full w-1.5 h-1.5 animate-pulse" />
      {{ $t('events.panel.loading') }}
    </div>

    <!-- Event list -->
    <div
      v-else-if="isExpanded && events.length > 0"
      class="flex-1 min-h-0 overflow-y-auto scrollbar-dim"
    >
      <div
        v-for="event in events"
        :key="event.id"
        class="flex items-start gap-3 hover:bg-accented px-4 py-2.5 border-default/50 border-b last:border-b-0 transition-colors"
        @pointerenter="emit('hoverEvent', event)"
        @pointerleave="emit('hoverEvent', null)"
      >
        <span
          class="flex-shrink-0 mt-1.5 rounded-full w-1.5 h-1.5"
          :class="severityDotClass(event.severity)"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="tabular-nums text-[10px] text-dimmed">{{ formatDate(event.date) }}</span>
            <span
              class="font-medium text-[10px]"
              :class="severityTextClass(event.severity)"
            >
              {{ $t(event.titleKey) }}
            </span>
          </div>
          <p class="mt-0.5 text-toned text-xs truncate">
            {{ $t(event.descriptionKey, event.params) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="isExpanded"
      class="px-4 py-4 text-dimmed text-xs text-center"
    >
      {{ $t('events.panel.empty') }}
    </div>
  </div>
</template>

<style scoped>
.scrollbar-dim::-webkit-scrollbar {
  width: 5px;
}
.scrollbar-dim::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-dim::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 999px;
}
.scrollbar-dim::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.45);
}
</style>
