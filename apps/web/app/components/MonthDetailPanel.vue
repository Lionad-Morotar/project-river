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
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedMonth', value: string | null): void
  (e: 'export'): void
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
    class="flex flex-col h-full bg-slate-900"
  >
    <!-- Header row -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <button
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Previous month"
          :disabled="!canGoPrevious"
          @click="goPrevious"
        >
          &#8249;
        </button>
        <span class="text-sm font-semibold text-slate-100 min-w-[80px] text-center">{{ selectedMonth ?? '—' }}</span>
        <button
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Next month"
          :disabled="!canGoNext"
          @click="goNext"
        >
          &#8250;
        </button>
      </div>
      <button
        class="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors"
        @click="emit('export')"
      >
        Export SVG
      </button>
    </div>

    <!-- Metrics row -->
    <div class="grid grid-cols-2 gap-4 px-4 py-3">
      <div>
        <div class="text-xs text-slate-400 font-medium">
          {{ isAllHistory ? 'Total commits' : 'Commits this month' }}
        </div>
        <div class="text-2xl font-semibold text-slate-100 tabular-nums">
          {{ commitsThisMonth }}
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-400 font-medium">
          {{ isAllHistory ? 'Total commits to date' : 'Total commits to date' }}
        </div>
        <div class="text-2xl font-semibold text-slate-100 tabular-nums">
          {{ totalCommitsToDate }}
        </div>
      </div>
    </div>

    <!-- Contributors section -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="text-xs text-slate-400 font-medium px-4 py-2 border-t border-slate-800">
        Contributors
      </div>
      <div class="overflow-y-auto flex-1 px-4 pb-4">
        <div
          v-for="c in contributors"
          :key="c.contributor"
          class="flex items-center justify-between gap-3 py-1.5 hover:bg-slate-800 rounded px-2 -mx-2 transition-colors"
        >
          <div class="flex items-center gap-2.5">
            <div
              class="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              :style="{ backgroundColor: c.color }"
            />
            <span class="text-sm text-slate-300 truncate">{{ c.contributor }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-semibold text-slate-300 tabular-nums">{{ c.monthlyCommits }}</span>
            <span class="text-xs text-slate-500 tabular-nums w-12 text-right">{{ c.cumulativeCommits }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else
    class="flex flex-col items-center justify-center py-12 px-6 text-center h-full bg-slate-900"
  >
    <h2 class="text-sm font-medium text-slate-300 mb-2">
      No contributor data yet
    </h2>
    <p class="text-xs text-slate-500">
      There is no contributor data for this project yet. Run the analyzer to populate statistics.
    </p>
  </div>
</template>
