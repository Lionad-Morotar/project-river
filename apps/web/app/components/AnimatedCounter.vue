<script setup lang="ts">
const props = defineProps<{
  target: number
  suffix?: string
  prefix?: string
  decimals?: number
  duration?: number
}>()

const displayValue = ref(0)
let rafId: number | null = null

function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4
}

function animate() {
  const start = displayValue.value
  const end = props.target
  const duration = props.duration ?? 1200
  const startTime = performance.now()

  function step(now: number) {
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeOutQuart(progress)
    displayValue.value = start + (end - start) * eased

    if (progress < 1) {
      rafId = requestAnimationFrame(step)
    }
  }

  if (rafId)
    cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(step)
}

watch(() => props.target, animate, { immediate: true })

onUnmounted(() => {
  if (rafId)
    cancelAnimationFrame(rafId)
})

const formatted = computed(() => {
  const d = props.decimals ?? 0
  const n = displayValue.value
  if (d > 0) {
    return n.toFixed(d)
  }
  if (n >= 10000) {
    return `${(n / 1000).toFixed(1)}k`
  }
  return Math.round(n).toString()
})
</script>

<template>
  <span class="tabular-nums tracking-tight">
    <span v-if="prefix" class="text-muted">{{ prefix }}</span>
    {{ formatted }}
    <span v-if="suffix" class="text-muted">{{ suffix }}</span>
  </span>
</template>
