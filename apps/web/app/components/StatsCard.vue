<script setup lang="ts">
const props = defineProps<{
  value: number
  label: string
  suffix?: string
  prefix?: string
  decimals?: number
  trend?: number
  delay?: number
}>()

const visible = ref(false)

onMounted(() => {
  setTimeout(() => {
    visible.value = true
  }, props.delay ?? 0)
})
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-700 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.03]"
    :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
    style="box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.08);"
  >
    <!-- Top glow accent line — liquid refraction edge -->
    <div
      class="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent dark:via-cyan-300/25"
      style="box-shadow: 0 1px 6px rgba(100,200,255,0.15);"
    />

    <!-- Subtle inner gradient for depth -->
    <div
      class="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:from-white/[0.03]"
    />

    <div class="relative z-10 flex items-baseline gap-1.5">
      <span class="text-2xl font-semibold text-highlighted tabular-nums tracking-tight">
        <AnimatedCounter
          :target="value"
          :suffix="suffix"
          :prefix="prefix"
          :decimals="decimals"
        />
      </span>
      <span
        v-if="trend !== undefined"
        class="text-xs font-medium"
        :class="trend >= 0 ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ trend >= 0 ? '+' : '' }}{{ trend }}%
      </span>
    </div>
    <p class="relative z-10 mt-1.5 text-xs text-dimmed">
      {{ label }}
    </p>
  </div>
</template>
