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
  activeDays: number
  totalDays: number
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

const activeContributors = computed(() => props.contributors.filter(c => c.monthlyCommits > 0).length)
const avgCommitsPerContributor = computed(() => {
  if (activeContributors.value === 0)
    return 0
  return Math.round(props.commitsThisMonth / activeContributors.value)
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
    class="flex flex-col bg-muted h-full"
  >
    <!-- Header row -->
    <div class="flex justify-between items-center px-4 py-3 border-default border-b">
      <div class="flex items-center gap-2">
        <button
          class="flex justify-center items-center hover:bg-elevated disabled:hover:bg-transparent disabled:opacity-30 rounded w-8 h-8 text-muted hover:text-highlighted transition-colors"
          :aria-label="$t('monthSelector.previousYear')"
          :disabled="!canGoPrevious"
          @click="goPrevious"
        >
          &#8249;
        </button>
        <span class="min-w-[80px] font-semibold text-highlighted text-sm text-center">{{ rangeLabel || selectedMonth || '—' }}</span>
        <button
          class="flex justify-center items-center hover:bg-elevated disabled:hover:bg-transparent disabled:opacity-30 rounded w-8 h-8 text-muted hover:text-highlighted transition-colors"
          :aria-label="$t('monthSelector.nextYear')"
          :disabled="!canGoNext"
          @click="goNext"
        >
          &#8250;
        </button>
      </div>
      <button
        class="hover:bg-elevated px-3 py-1.5 border border-accented rounded-md font-medium text-toned hover:text-highlighted text-xs transition-colors"
        @click="emit('export')"
      >
        {{ $t('common.export') }}
      </button>
    </div>

    <!-- Metrics row -->
    <div class="gap-4 grid grid-cols-5 px-4 py-3">
      <div>
        <div class="font-medium text-muted text-xs">
          {{ isAllHistory ? $t('project.totalCommits') : $t('project.commitsThisYear') }}
        </div>
        <div class="font-semibold tabular-nums text-highlighted text-2xl">
          {{ commitsThisMonth }}
          <span
            v-if="monthDelta && !rangeLabel"
            class="ml-1 font-medium tabular-nums text-xs"
            :class="monthDelta.change >= 0 ? 'text-emerald-400' : 'text-red-400'"
          >
            {{ monthDelta.change >= 0 ? '↑' : '↓' }}{{ Math.abs(monthDelta.pct) }}%
          </span>
        </div>
      </div>
      <div>
        <div class="font-medium text-muted text-xs">
          {{ isAllHistory ? $t('project.totalCommitsToDate') : $t('project.allTimeTotal') }}
        </div>
        <div class="font-semibold tabular-nums text-highlighted text-2xl">
          {{ totalCommitsToDate }}
        </div>
      </div>
      <div>
        <div class="font-medium text-muted text-xs">
          {{ $t('panel.activeContributors') }}
        </div>
        <div class="font-semibold tabular-nums text-highlighted text-2xl">
          {{ activeContributors }}
        </div>
      </div>
      <div>
        <div class="font-medium text-muted text-xs">
          {{ $t('panel.avgCommits') }}
        </div>
        <div class="font-semibold tabular-nums text-highlighted text-2xl">
          {{ avgCommitsPerContributor }}
        </div>
      </div>
      <div>
        <div class="font-medium text-muted text-xs">
          {{ $t('panel.activeDays') }}
        </div>
        <div class="font-semibold tabular-nums text-highlighted text-2xl">
          {{ activeDays }}<span class="font-normal text-muted text-xs"> / {{ totalDays }}</span>
        </div>
      </div>
    </div>

    <!-- Contributors section -->
    <div class="flex flex-col flex-1 min-h-0">
      <div class="flex justify-between items-center gap-3 px-4 py-2 border-default border-t">
        <span class="font-medium text-muted text-xs">
          {{ $t('panel.contributors') }}
        </span>
        <div class="flex items-center gap-3">
          <span class="font-medium text-[10px] text-dimmed uppercase tracking-wider">{{ $t('panel.yearly') }}</span>
          <span class="w-12 font-medium text-[10px] text-dimmed text-right uppercase tracking-wider">{{ $t('panel.total') }}</span>
        </div>
      </div>
      <div class="flex-1 px-4 pb-4 overflow-y-auto scrollbar-dim">
        <div
          v-for="(c, idx) in contributors"
          :key="c.contributor"
          class="flex justify-between items-center gap-2 hover:bg-accented -mx-2 px-2 py-1.5 rounded transition-colors"
          @pointerenter="emit('hoverContributor', c.contributor)"
          @pointerleave="emit('hoverContributor', null)"
        >
          <div class="flex items-center gap-2">
            <span class="flex-shrink-0 w-4 tabular-nums text-[10px] text-dimmed text-right">{{ idx + 1 }}</span>
            <div
              class="flex-shrink-0 rounded-sm w-2.5 h-2.5"
              :style="{ backgroundColor: c.color }"
            />
            <span class="text-toned text-sm truncate">{{ c.contributor }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-semibold tabular-nums text-toned text-xs">{{ c.monthlyCommits }}</span>
            <span class="w-12 tabular-nums text-dimmed text-xs text-right">{{ c.cumulativeCommits }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else
    class="flex flex-col justify-center items-center bg-muted px-6 py-12 h-full text-center"
  >
    <h2 class="mb-2 font-medium text-toned text-sm">
      {{ $t('panel.noContributorData') }}
    </h2>
    <p class="text-dimmed text-xs">
      {{ $t('panel.noContributorDataHint') }}
    </p>
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
