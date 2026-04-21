<script setup lang="ts">
import { computed } from 'vue'

interface MonthContributor {
  contributor: string
  monthlyCommits: number
  cumulativeCommits: number
  color: string
}

interface Props {
  selectedMonth: string | null
  availableMonths: string[]
  contributors: MonthContributor[]
  commitsThisMonth: number
  totalCommitsToDate: number
  hasData: boolean
  isAllHistory?: boolean
  previousMonthCommits?: number
  rangeLabel?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedMonth', value: string | null): void
  (e: 'export'): void
  (e: 'hoverContributor', name: string | null): void
}>()

const canGoPrevious = computed(() => {
  if (!props.selectedMonth || props.availableMonths.length === 0)
    return false
  return props.selectedMonth !== props.availableMonths[0]
})

const canGoNext = computed(() => {
  if (!props.selectedMonth || props.availableMonths.length === 0)
    return false
  return props.selectedMonth !== props.availableMonths[props.availableMonths.length - 1]
})

const monthDelta = computed(() => {
  if (props.isAllHistory || !props.previousMonthCommits || props.previousMonthCommits === 0)
    return null
  const change = props.commitsThisMonth - props.previousMonthCommits
  const pct = Math.round(change / props.previousMonthCommits * 100)
  return { change, pct }
})

function goPrevious() {
  if (!props.selectedMonth)
    return
  const idx = props.availableMonths.indexOf(props.selectedMonth)
  if (idx > 0) {
    emit('update:selectedMonth', props.availableMonths[idx - 1] ?? null)
  }
}

function goNext() {
  if (!props.selectedMonth)
    return
  const idx = props.availableMonths.indexOf(props.selectedMonth)
  if (idx >= 0 && idx < props.availableMonths.length - 1) {
    emit('update:selectedMonth', props.availableMonths[idx + 1] ?? null)
  }
}
</script>

<template>
  <div
    v-if="hasData"
    class="flex flex-col h-full bg-muted"
  >
    <!-- Header row -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <div class="flex items-center gap-2">
        <button
          class="w-8 h-8 flex items-center justify-center text-muted hover:text-highlighted hover:bg-elevated rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          :aria-label="$t('monthSelector.previousYear')"
          :disabled="!canGoPrevious"
          @click="goPrevious"
        >
          &#8249;
        </button>
        <span class="text-sm font-semibold text-highlighted min-w-[80px] text-center">{{ rangeLabel || selectedMonth || '—' }}</span>
        <button
          class="w-8 h-8 flex items-center justify-center text-muted hover:text-highlighted hover:bg-elevated rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          :aria-label="$t('monthSelector.nextYear')"
          :disabled="!canGoNext"
          @click="goNext"
        >
          &#8250;
        </button>
      </div>
      <button
        class="px-3 py-1.5 text-xs font-medium text-toned hover:text-highlighted hover:bg-elevated border border-accented rounded-md transition-colors"
        @click="emit('export')"
      >
        {{ $t('common.export') }}
      </button>
    </div>

    <!-- Metrics row -->
    <div class="grid grid-cols-2 gap-4 px-4 py-3">
      <div>
        <div class="text-xs text-muted font-medium">
          {{ isAllHistory ? $t('project.totalCommits') : $t('project.commitsThisYear') }}
        </div>
        <div class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ commitsThisMonth }}
          <span
            v-if="monthDelta && !rangeLabel"
            class="text-xs font-medium tabular-nums ml-1"
            :class="monthDelta.change >= 0 ? 'text-emerald-400' : 'text-red-400'"
          >
            {{ monthDelta.change >= 0 ? '↑' : '↓' }}{{ Math.abs(monthDelta.pct) }}%
          </span>
        </div>
      </div>
      <div>
        <div class="text-xs text-muted font-medium">
          {{ isAllHistory ? $t('project.totalCommitsToDate') : $t('project.allTimeTotal') }}
        </div>
        <div class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ totalCommitsToDate }}
        </div>
      </div>
    </div>

    <!-- Contributors section -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between gap-3 px-4 py-2 border-t border-default">
        <span class="text-xs text-muted font-medium">
          {{ $t('panel.contributors') }}
        </span>
        <div class="flex items-center gap-3">
          <span class="text-[10px] text-dimmed font-medium uppercase tracking-wider">{{ $t('panel.yearly') }}</span>
          <span class="text-[10px] text-dimmed font-medium uppercase tracking-wider w-12 text-right">{{ $t('panel.total') }}</span>
        </div>
      </div>
      <div class="overflow-y-auto flex-1 px-4 pb-4">
        <div
          v-for="c in contributors"
          :key="c.contributor"
          class="flex items-center justify-between gap-3 py-1.5 hover:bg-elevated rounded px-2 -mx-2 transition-colors"
          @pointerenter="emit('hoverContributor', c.contributor)"
          @pointerleave="emit('hoverContributor', null)"
        >
          <div class="flex items-center gap-2.5">
            <div
              class="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              :style="{ backgroundColor: c.color }"
            />
            <span class="text-sm text-toned truncate">{{ c.contributor }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-semibold text-toned tabular-nums">{{ c.monthlyCommits }}</span>
            <span class="text-xs text-dimmed tabular-nums w-12 text-right">{{ c.cumulativeCommits }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else
    class="flex flex-col items-center justify-center py-12 px-6 text-center h-full bg-muted"
  >
    <h2 class="text-sm font-medium text-toned mb-2">
      {{ $t('panel.noContributorData') }}
    </h2>
    <p class="text-xs text-dimmed">
      {{ $t('panel.noContributorDataHint') }}
    </p>
  </div>
</template>
