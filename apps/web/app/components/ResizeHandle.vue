<script setup lang="ts">
interface Props {
  orientation: 'horizontal' | 'vertical'
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'move', delta: number): void
  (e: 'end'): void
}>()

let dragging = false
let startPos = 0

function onPointerDown(event: PointerEvent) {
  dragging = true
  startPos = event.clientX + event.clientY
  const target = event.currentTarget as HTMLElement
  if (target.setPointerCapture) {
    target.setPointerCapture(event.pointerId)
  }
  emit('start')
}

function onPointerMove(event: PointerEvent) {
  if (!dragging)
    return
  const currentPos = event.clientX + event.clientY
  const delta = currentPos - startPos
  startPos = currentPos
  emit('move', delta)
}

function onPointerUp(event: PointerEvent) {
  if (!dragging)
    return
  dragging = false
  const target = event.currentTarget as HTMLElement
  if (target.releasePointerCapture) {
    target.releasePointerCapture(event.pointerId)
  }
  emit('end')
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    emit('move', -10)
    emit('end')
  }
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    emit('move', 10)
    emit('end')
  }
}
</script>

<template>
  <div
    role="separator"
    tabindex="0"
    :aria-orientation="orientation"
    class="shrink-0 bg-default hover:bg-accented focus:outline-none focus:bg-sky-500 transition-colors flex items-center justify-center"
    :class="orientation === 'horizontal'
      ? 'w-full h-3 cursor-row-resize'
      : 'w-3 h-full cursor-col-resize'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @keydown="onKeyDown"
  >
    <!-- Six-dot drag handle -->
    <svg
      v-if="orientation === 'horizontal'"
      width="24"
      height="6"
      viewBox="0 0 24 6"
      fill="none"
      class="text-dimmed"
    >
      <circle cx="5" cy="1.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="1.5" r="1.2" fill="currentColor" />
      <circle cx="19" cy="1.5" r="1.2" fill="currentColor" />
      <circle cx="5" cy="4.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="4.5" r="1.2" fill="currentColor" />
      <circle cx="19" cy="4.5" r="1.2" fill="currentColor" />
    </svg>
    <svg
      v-else
      width="6"
      height="24"
      viewBox="0 0 6 24"
      fill="none"
      class="text-dimmed"
    >
      <circle cx="1.5" cy="5" r="1.2" fill="currentColor" />
      <circle cx="1.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="1.5" cy="19" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="5" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="19" r="1.2" fill="currentColor" />
    </svg>
  </div>
</template>
