<script setup lang="ts">
import type { Granularity } from '~/utils/d3Helpers'

interface Props {
  visible: boolean
  x: number
  y: number
  contributor: string
  date: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  percentage: number
  totalCommits?: number
  granularity?: Granularity
}

const props = withDefaults(defineProps<Props>(), {
  totalCommits: 0,
  granularity: 'day',
})

const formattedDate = computed(() => {
  const d = props.date
  if (!d)
    return ''
  if (props.granularity === 'week') {
    // "2025-W16" or "2025-01-06" → "2025 W16"
    const match = d.match(/^(\d{4})-W(\d{2})$/)
    if (match)
      return `${match[1]} W${Number(match[2])}`
    // fallback: derive week from date
    const dt = new Date(d)
    const jan1 = new Date(dt.getUTCFullYear(), 0, 1)
    const week = Math.ceil(((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    return `${dt.getUTCFullYear()} W${week}`
  }
  if (props.granularity === 'month') {
    // "2025-04-01" → "2025-04"
    return d.substring(0, 7)
  }
  // day: "2025-04-15"
  return d
})
</script>

<template>
  <div
    v-if="visible"
    class="absolute z-50 min-w-[170px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 shadow-md"
    :style="{ left: `${x}px`, top: `${y}px`, pointerEvents: 'none' }"
  >
    <div class="mb-1 flex items-center justify-between gap-3">
      <span class="text-xs font-semibold text-slate-100 truncate max-w-[140px]">
        {{ contributor }}
      </span>
      <span
        v-if="percentage > 0"
        class="shrink-0 text-xs font-medium text-sky-400"
      >
        {{ percentage }}%
      </span>
    </div>
    <div class="mb-2 text-xs text-slate-400">
      {{ formattedDate }}
    </div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <div>
        <div class="text-slate-500">
          Commits
        </div>
        <div class="text-slate-200 font-medium">
          {{ commits }}
        </div>
      </div>
      <div>
        <div class="text-slate-500">
          Lines changed
        </div>
        <div class="text-slate-200 font-medium">
          {{ linesAdded + linesDeleted }}
        </div>
      </div>
      <div>
        <div class="text-slate-500">
          Files changed
        </div>
        <div class="text-slate-200 font-medium">
          {{ filesTouched }}
        </div>
      </div>
      <div v-if="totalCommits !== undefined">
        <div class="text-slate-500">
          Day total
        </div>
        <div class="text-slate-200 font-medium">
          {{ totalCommits }}
        </div>
      </div>
    </div>
  </div>
</template>
