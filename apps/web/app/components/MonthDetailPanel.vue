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

const { x, y, isDragging, style } = useDraggable(panelRef, {
  handle: handleRef,
  initialValue: { x: vw.value - PANEL_W, y: 80 },
  preventDefault: true,
  onEnd: snapToEdge,
})

const panelStyle = computed(() => ({
  ...style.value,
  position: 'fixed',
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
    class="bg-slate-800 border-l border-t border-b border-slate-700 rounded-l-lg flex flex-col"
    :style="panelStyle"
    :class="{ 'cursor-grabbing': isDragging }"
  >
    <!-- Drag handle (left edge when docked right) -->
    <div
      v-if="dockedEdge === 'right'"
      ref="handleRef"
      class="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50"
      aria-label="Drag panel"
    >
      <div class="w-1 h-6 bg-slate-600 rounded" />
      <div class="w-1 h-6 bg-slate-600 rounded" />
    </div>

    <!-- Header row -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 pl-10">
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          class="min-w-[44px] min-h-[44px]"
          aria-label="Previous month"
          :disabled="!canGoPrevious"
          @click="goPrevious"
        >
          &lt;
        </UButton>
        <span class="text-xl font-semibold text-slate-100">{{ selectedMonth ?? '—' }}</span>
        <UButton
          variant="ghost"
          color="neutral"
          class="min-w-[44px] min-h-[44px]"
          aria-label="Next month"
          :disabled="!canGoNext"
          @click="goNext"
        >
          &gt;
        </UButton>
      </div>
      <UButton
        label="Export SVG"
        variant="solid"
        color="primary"
        leading-icon="i-lucide-arrow-down-to-line"
        @click="emit('export')"
      />
    </div>

    <!-- Metrics row -->
    <div class="grid grid-cols-2 gap-4 px-4 py-4 pl-10">
      <div>
        <div class="text-sm font-semibold text-slate-400">
          Commits this month
        </div>
        <div class="text-3xl font-semibold text-slate-100">
          {{ commitsThisMonth }}
        </div>
      </div>
      <div>
        <div class="text-sm font-semibold text-slate-400">
          Total commits to date
        </div>
        <div class="text-3xl font-semibold text-slate-100">
          {{ totalCommitsToDate }}
        </div>
      </div>
    </div>

    <!-- Contributors section -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="text-sm font-semibold text-slate-400 px-4 py-2 border-t border-slate-700 pl-10">
        Contributors
      </div>
      <div class="overflow-y-auto flex-1 px-4 pb-4 pl-10">
        <div
          v-for="c in contributors"
          :key="c.contributor"
          class="flex items-center justify-between gap-3 py-2 hover:bg-white/[0.03] rounded px-2 -mx-2"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-4 h-4 rounded"
              :style="{ backgroundColor: c.color }"
            />
            <span class="text-base text-slate-200">{{ c.contributor }}</span>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm font-semibold text-slate-200">{{ c.monthlyCommits }}</span>
            <span class="text-sm font-semibold text-slate-400 w-16 text-right">{{ c.cumulativeCommits }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else
    ref="panelRef"
    class="bg-slate-800 border-l border-t border-b border-slate-700 rounded-l-lg flex flex-col"
    :style="panelStyle"
  >
    <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
      <h2 class="text-xl font-semibold text-slate-200 mb-2">
        No contributor data yet
      </h2>
      <p class="text-slate-400">
        There is no contributor data for this project yet. Run the analyzer to populate statistics.
      </p>
    </div>
  </div>
</template>
