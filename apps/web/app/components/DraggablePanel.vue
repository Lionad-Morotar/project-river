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
  (e: 'dock', edge: 'top' | 'left' | 'right' | 'bottom'): void
  (e: 'preview', edge: 'top' | 'left' | 'right' | 'bottom' | null): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)

const { width: vw, height: vh } = useWindowSize()

const x = defineModel<number>('x', { default: 0 })
const y = defineModel<number>('y', { default: 0 })

const dragStartX = ref(0)
const dragStartY = ref(0)

const { isDragging, x: dragX, y: dragY } = useDraggable(panelRef, {
  handle: handleRef,
  initialValue: { x: x.value || props.initialX, y: y.value || props.initialY },
  preventDefault: true,
  onStart: () => {
    dragStartX.value = dragX.value
    dragStartY.value = dragY.value
    emit('dragStart')
  },
  onEnd: () => {
    x.value = dragX.value
    y.value = dragY.value
    clampPosition()
    dragX.value = x.value
    dragY.value = y.value
    detectDock()
    emit('preview', null)
    emit('dragEnd')
  },
})

watch([dragX, dragY], ([nx, ny]) => {
  if (isDragging.value) {
    x.value = nx
    y.value = ny
    detectPreviewEdge()
  }
})

const panelStyle = computed(() => ({
  left: `${dragX.value}px`,
  top: `${dragY.value}px`,
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

function detectPreviewEdge() {
  const el = panelRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  const threshold = 40
  const distLeft = dragX.value
  const distRight = vw.value - (dragX.value + rect.width)
  const distTop = dragY.value
  const distBottom = vh.value - (dragY.value + rect.height)
  const minDist = Math.min(distLeft, distRight, distTop, distBottom)
  if (minDist > threshold) {
    emit('preview', null)
    return
  }

  const deltaX = dragX.value - dragStartX.value
  const deltaY = dragY.value - dragStartY.value
  const absDX = Math.abs(deltaX)
  const absDY = Math.abs(deltaY)

  const candidates = [
    { edge: 'left' as const, dist: distLeft, axis: 'x' as const },
    { edge: 'right' as const, dist: distRight, axis: 'x' as const },
    { edge: 'top' as const, dist: distTop, axis: 'y' as const },
    { edge: 'bottom' as const, dist: distBottom, axis: 'y' as const },
  ].filter(c => c.dist === minDist)

  if (candidates.length === 1) {
    emit('preview', candidates[0]!.edge)
    return
  }

  if (absDY >= absDX) {
    const yCandidate = candidates.find(c => c.axis === 'y')
    if (yCandidate) {
      emit('preview', yCandidate.edge)
      return
    }
  }
  const xCandidate = candidates.find(c => c.axis === 'x')
  if (xCandidate) {
    emit('preview', xCandidate.edge)
    return
  }
  emit('preview', candidates[0]!.edge)
}

function detectDock() {
  const el = panelRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  const threshold = 40
  const distLeft = x.value
  const distRight = vw.value - (x.value + rect.width)
  const distTop = y.value
  const distBottom = vh.value - (y.value + rect.height)
  const minDist = Math.min(distLeft, distRight, distTop, distBottom)
  if (minDist > threshold)
    return

  const deltaX = x.value - dragStartX.value
  const deltaY = y.value - dragStartY.value
  const absDX = Math.abs(deltaX)
  const absDY = Math.abs(deltaY)

  const candidates = [
    { edge: 'left' as const, dist: distLeft, axis: 'x' as const },
    { edge: 'right' as const, dist: distRight, axis: 'x' as const },
    { edge: 'top' as const, dist: distTop, axis: 'y' as const },
    { edge: 'bottom' as const, dist: distBottom, axis: 'y' as const },
  ].filter(c => c.dist === minDist)

  if (candidates.length === 1) {
    emit('dock', candidates[0]!.edge)
    return
  }

  if (absDY >= absDX) {
    const yCandidate = candidates.find(c => c.axis === 'y')
    if (yCandidate) {
      emit('dock', yCandidate.edge)
      return
    }
  }
  const xCandidate = candidates.find(c => c.axis === 'x')
  if (xCandidate) {
    emit('dock', xCandidate.edge)
    return
  }
  emit('dock', candidates[0]!.edge)
}

watch([vw, vh], () => {
  if (!isDragging.value) {
    clampPosition()
    dragX.value = x.value
    dragY.value = y.value
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
      class="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50 hover:bg-elevated/50 transition-colors rounded-l"
      aria-label="Drag panel"
    >
      <div class="w-0.5 h-5 bg-accented rounded-full" />
      <div class="w-0.5 h-5 bg-accented rounded-full" />
    </div>
    <div class="pl-6 h-full">
      <slot />
    </div>
  </div>
</template>
