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
    class="group relative overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 transition-all duration-700 backdrop-blur-xl"
    :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
    style="box-shadow: var(--glass-inner), 0 4px 24px rgba(0,0,0,0.12);"
  >
    <!-- Top glow accent line — liquid refraction edge -->
    <div
      class="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-[var(--glow-cyan)] to-transparent"
      style="box-shadow: 0 1px 8px rgba(100,200,255,0.25);"
    />

    <!-- Subtle inner gradient for depth -->
    <div
      class="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:from-white/[0.05]"
    />

    <div class="relative z-10 flex items-baseline gap-1.5">
      <span class="text-3xl font-semibold text-highlighted tabular-nums tracking-tight">
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
    <p class="relative z-10 mt-2 text-sm text-dimmed">
      {{ label }}
    </p>
  </div>
</template>
