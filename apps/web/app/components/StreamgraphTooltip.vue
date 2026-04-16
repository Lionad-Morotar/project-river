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
    class="absolute z-50 min-w-[170px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 shadow-md"
    :style="{ left: `${x}px`, top: `${y}px`, pointerEvents: 'none' }"
  >
    <div class="mb-1 text-xs font-semibold text-slate-100 truncate max-w-[200px]">
      {{ contributor }}
    </div>
    <div class="mb-2 text-xs text-slate-400">
      {{ date }}
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
          Files touched
        </div>
        <div class="text-slate-200 font-medium">
          {{ filesTouched }}
        </div>
      </div>
    </div>
  </div>
</template>
