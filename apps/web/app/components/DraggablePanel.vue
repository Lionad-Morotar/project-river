<script setup lang="ts">
import { useDraggable, useWindowSize } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

interface Props {
  initialX?: number
  initialY?: number
  minX?: number
  minY?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialX: 0,
  initialY: 0,
  minX: 8,
  minY: 8,
})

const emit = defineEmits<{
  (e: 'dragStart'): void
  (e: 'dragEnd'): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)

const { width: vw, height: vh } = useWindowSize()

const { x, y, isDragging } = useDraggable(panelRef, {
  handle: handleRef,
  initialValue: { x: props.initialX, y: props.initialY },
  preventDefault: true,
  onStart: () => emit('dragStart'),
  onEnd: () => {
    clampPosition()
    emit('dragEnd')
  },
})

const panelStyle = computed(() => ({
  left: `${x.value}px`,
  top: `${y.value}px`,
  position: 'fixed' as const,
  zIndex: 40,
}))

function clampPosition() {
  const el = panelRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  const maxX = Math.max(props.minX, vw.value - rect.width - 8)
  const maxY = Math.max(props.minY, vh.value - rect.height - 8)
  x.value = Math.max(props.minX, Math.min(x.value, maxX))
  y.value = Math.max(props.minY, Math.min(y.value, maxY))
}

watch([vw, vh], () => {
  if (!isDragging.value) {
    clampPosition()
  }
})

defineExpose({
  panelRef,
  handleRef,
  x,
  y,
  isDragging,
})
</script>

<template>
  <div
    ref="panelRef"
    class="flex flex-col"
    :style="panelStyle"
    :class="{ 'cursor-grabbing': isDragging }"
  >
    <div
      ref="handleRef"
      class="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50 hover:bg-slate-800/50 transition-colors rounded-l"
      aria-label="Drag panel"
    >
      <div class="w-0.5 h-5 bg-slate-500 rounded-full" />
      <div class="w-0.5 h-5 bg-slate-500 rounded-full" />
    </div>
    <div class="pl-6 h-full">
      <slot />
    </div>
  </div>
</template>
