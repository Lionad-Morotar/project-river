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
    class="shrink-0 bg-accented hover:bg-accented focus:outline-none focus:bg-sky-500 transition-colors"
    :class="orientation === 'horizontal'
      ? 'w-full h-1.5 cursor-row-resize'
      : 'w-1.5 h-full cursor-col-resize'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @keydown="onKeyDown"
  />
</template>
