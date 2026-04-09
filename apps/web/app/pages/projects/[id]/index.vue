<script setup lang="ts">
import type { DailyRow } from '~/utils/d3Helpers'

interface MonthlyRow {
  yearMonth: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
}

const route = useRoute()
const projectId = route.params.id as string

const dailyData = ref<DailyRow[]>([])
const monthlyData = ref<MonthlyRow[]>([])
const selectedMonth = ref<string | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  contributor: '',
  date: '',
  commits: 0,
  linesAdded: 0,
  linesDeleted: 0,
  filesTouched: 0,
})

const chartWidth = ref(1024)
const chartHeight = ref(480)

const availableMonths = computed(() => Array.from(new Set(monthlyData.value.map(m => m.yearMonth))).sort())

const graphContainerRef = ref<HTMLDivElement | null>(null)

function updateChartWidth() {
  if (graphContainerRef.value) {
    chartWidth.value = graphContainerRef.value.clientWidth
  }
}

onMounted(async () => {
  updateChartWidth()
  window.addEventListener('resize', updateChartWidth)

  try {
    const [daily, monthly] = await Promise.all([
      $fetch<DailyRow[]>(`/api/projects/${projectId}/daily`),
      $fetch<MonthlyRow[]>(`/api/projects/${projectId}/monthly`),
    ])
    dailyData.value = daily
    monthlyData.value = monthly
  }
  catch {
    error.value = 'Failed to load project data. Please check your connection and try again.'
  }
  finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateChartWidth)
})

function onHover(event: PointerEvent, payload: { contributor: string, date: string, commits: number, linesAdded: number, linesDeleted: number, filesTouched: number } | null) {
  if (!payload) {
    tooltip.value.visible = false
    return
  }
  tooltip.value.visible = true
  tooltip.value.contributor = payload.contributor
  tooltip.value.date = payload.date
  tooltip.value.commits = payload.commits
  tooltip.value.linesAdded = payload.linesAdded
  tooltip.value.linesDeleted = payload.linesDeleted
  tooltip.value.filesTouched = payload.filesTouched
  tooltip.value.x = event.clientX + 12
  tooltip.value.y = event.clientY + 12
}
</script>

<template>
  <div class="p-6 lg:p-10 max-w-7xl mx-auto">
    <h1 class="text-2xl font-semibold mb-6">
      Project {{ projectId }}
    </h1>

    <div v-if="loading" class="text-slate-400">
      Loading...
    </div>

    <div
      v-else-if="error"
      class="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-red-200"
    >
      {{ error }}
    </div>

    <div v-else-if="dailyData.length === 0" class="text-center py-16">
      <h2 class="text-xl font-semibold text-slate-200 mb-2">
        No data available yet
      </h2>
      <p class="text-slate-400">
        Run the CLI analyzer on a repository to see the Streamgraph here.
      </p>
    </div>

    <div v-else>
      <div class="flex items-center gap-4 mb-4">
        <MonthSelector
          v-model="selectedMonth"
          :months="availableMonths"
        />
        <UButton
          color="primary"
          variant="solid"
          @click="selectedMonth = null"
        >
          Show All History
        </UButton>
      </div>

      <div
        ref="graphContainerRef"
        class="relative w-full h-[520px] bg-slate-900 rounded-lg overflow-hidden border border-slate-800"
      >
        <Streamgraph
          :data="dailyData"
          :width="chartWidth"
          :height="chartHeight"
          :selected-month="selectedMonth"
          @update:selected-month="selectedMonth = $event"
          @hover="onHover"
        />
        <StreamgraphTooltip
          :visible="tooltip.visible"
          :x="tooltip.x"
          :y="tooltip.y"
          :contributor="tooltip.contributor"
          :date="tooltip.date"
          :commits="tooltip.commits"
          :lines-added="tooltip.linesAdded"
          :lines-deleted="tooltip.linesDeleted"
          :files-touched="tooltip.filesTouched"
        />
      </div>
    </div>
  </div>
</template>
