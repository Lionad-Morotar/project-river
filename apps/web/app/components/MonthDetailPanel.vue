<script setup lang="ts">
import { useDraggable, useWindowSize } from '@vueuse/core'
import { computed, ref } from 'vue'

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
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedMonth', value: string | null): void
  (e: 'export'): void
}>()

const { width: vw, height: vh } = useWindowSize()

const panelRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)
const dockedEdge = ref<'left' | 'right' | 'bottom'>('right')

const PANEL_W = 360
const BOTTOM_H = 280
const SNAP_THRESHOLD = 60

const { x, y, isDragging } = useDraggable(panelRef, {
  handle: handleRef,
  initialValue: { x: vw.value - PANEL_W, y: 80 },
  preventDefault: true,
  onEnd: snapToEdge,
})

const panelStyle = computed(() => ({
  left: `${x.value}px`,
  top: `${y.value}px`,
  position: 'fixed' as const,
  width: dockedEdge.value === 'bottom' ? '100%' : `${PANEL_W}px`,
  height: dockedEdge.value === 'bottom' ? `${BOTTOM_H}px` : 'auto',
  maxHeight: dockedEdge.value === 'bottom' ? `${BOTTOM_H}px` : 'calc(100vh - 80px)',
  zIndex: 40,
}))

function snapToEdge() {
  const cx = x.value + PANEL_W / 2
  const cy = y.value + (dockedEdge.value === 'bottom' ? BOTTOM_H : PANEL_W) / 2
  const dl = cx
  const dr = vw.value - cx
  const dt = cy
  const db = vh.value - cy
  const min = Math.min(dl, dr, dt, db)
  if (min > SNAP_THRESHOLD)
    return
  if (min === dl) {
    x.value = 0
    dockedEdge.value = 'left'
  }
  else if (min === dr) {
    x.value = vw.value - PANEL_W
    dockedEdge.value = 'right'
  }
  else if (min === db) {
    x.value = 0
    y.value = vh.value - BOTTOM_H
    dockedEdge.value = 'bottom'
  }
}

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
    emit('update:selectedMonth', props.availableMonths[idx - 1])
  }
}

function goNext() {
  if (!props.selectedMonth)
    return
  const idx = props.availableMonths.indexOf(props.selectedMonth)
  if (idx >= 0 && idx < props.availableMonths.length - 1) {
    emit('update:selectedMonth', props.availableMonths[idx + 1])
  }
}
</script>

<template>
  <div
    v-if="hasData"
    ref="panelRef"
    class="bg-white border border-slate-200 shadow-sm flex flex-col"
    :style="panelStyle"
    :class="{ 'cursor-grabbing': isDragging }"
  >
    <!-- Drag handle (left edge when docked right) -->
    <div
      v-if="dockedEdge === 'right'"
      ref="handleRef"
      class="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50 hover:bg-slate-50 transition-colors"
      aria-label="Drag panel"
    >
      <div class="w-0.5 h-5 bg-slate-300 rounded-full" />
      <div class="w-0.5 h-5 bg-slate-300 rounded-full" />
    </div>

    <!-- Header row -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 pl-10">
      <div class="flex items-center gap-2">
        <button
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Previous month"
          :disabled="!canGoPrevious"
          @click="goPrevious"
        >
          &#8249;
        </button>
        <span class="text-sm font-semibold text-slate-900 min-w-[80px] text-center">{{ selectedMonth ?? '—' }}</span>
        <button
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Next month"
          :disabled="!canGoNext"
          @click="goNext"
        >
          &#8250;
        </button>
      </div>
      <button
        class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
        @click="emit('export')"
      >
        Export SVG
      </button>
    </div>

    <!-- Metrics row -->
    <div class="grid grid-cols-2 gap-4 px-4 py-3 pl-10">
      <div>
        <div class="text-xs text-slate-400 font-medium">
          Commits this month
        </div>
        <div class="text-2xl font-semibold text-slate-900 tabular-nums">
          {{ commitsThisMonth }}
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-400 font-medium">
          Total commits to date
        </div>
        <div class="text-2xl font-semibold text-slate-900 tabular-nums">
          {{ totalCommitsToDate }}
        </div>
      </div>
    </div>

    <!-- Contributors section -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="text-xs text-slate-400 font-medium px-4 py-2 border-t border-slate-100 pl-10">
        Contributors
      </div>
      <div class="overflow-y-auto flex-1 px-4 pb-4 pl-10">
        <div
          v-for="c in contributors"
          :key="c.contributor"
          class="flex items-center justify-between gap-3 py-1.5 hover:bg-slate-50 rounded px-2 -mx-2 transition-colors"
        >
          <div class="flex items-center gap-2.5">
            <div
              class="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              :style="{ backgroundColor: c.color }"
            />
            <span class="text-sm text-slate-700 truncate">{{ c.contributor }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-semibold text-slate-700 tabular-nums">{{ c.monthlyCommits }}</span>
            <span class="text-xs text-slate-400 tabular-nums w-12 text-right">{{ c.cumulativeCommits }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else
    ref="panelRef"
    class="bg-white border border-slate-200 shadow-sm flex flex-col"
    :style="panelStyle"
  >
    <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
      <h2 class="text-sm font-medium text-slate-700 mb-2">
        No contributor data yet
      </h2>
      <p class="text-xs text-slate-400">
        There is no contributor data for this project yet. Run the analyzer to populate statistics.
      </p>
    </div>
  </div>
</template>
