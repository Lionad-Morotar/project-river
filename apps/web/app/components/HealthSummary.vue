<script setup lang="ts">
import type { HealthSignal } from '~/utils/healthRules'

interface Props {
  signals: HealthSignal[]
}

defineProps<Props>()

const severityConfig = {
  warning: { bg: 'bg-amber-950/40', border: 'border-amber-800/50', text: 'text-amber-300', dot: 'bg-amber-400' },
  positive: { bg: 'bg-emerald-950/40', border: 'border-emerald-800/50', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  info: { bg: 'bg-sky-950/40', border: 'border-sky-800/50', text: 'text-sky-300', dot: 'bg-sky-400' },
} as const
</script>

<template>
  <div
    v-if="signals.length > 0"
    class="flex flex-wrap gap-2"
  >
    <div
      v-for="signal in signals"
      :key="signal.id"
      class="group relative"
    >
      <span
        class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
        :class="[severityConfig[signal.severity].bg, severityConfig[signal.severity].border, severityConfig[signal.severity].text]"
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full"
          :class="severityConfig[signal.severity].dot"
        />
        {{ $t(signal.label) }}
      </span>
      <!-- Tooltip on hover -->
      <span
        class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
      >
        {{ signal.evidenceParams ? $t(signal.evidence, signal.evidenceParams) : $t(signal.evidence) }}
      </span>
    </div>
  </div>
</template>
