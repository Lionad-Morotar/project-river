<script setup lang="ts">
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
}

defineProps<Props>()
</script>

<template>
  <div
    v-if="visible"
    class="absolute z-50 min-w-[160px] rounded-md border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg"
    :style="{ left: `${x + 12}px`, top: `${y + 12}px` }"
  >
    <div class="mb-1 text-sm font-semibold text-blue-500">
      {{ contributor }}
    </div>
    <div class="mb-2 text-sm text-slate-200">
      {{ date }}
    </div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <div>
        <div class="text-xs text-slate-400">
          Commits
        </div>
        <div class="text-slate-100">
          {{ commits }}
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-400">
          Lines changed
        </div>
        <div class="text-slate-100">
          {{ linesAdded + linesDeleted }}
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-400">
          Files touched
        </div>
        <div class="text-slate-100">
          {{ filesTouched }}
        </div>
      </div>
    </div>
  </div>
</template>
