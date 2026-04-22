<script setup lang="ts">
import { useElementSize, useStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import DraggablePanel from '~/components/DraggablePanel.vue'
import ResizeHandle from '~/components/ResizeHandle.vue'

interface Props {
  panelWidth?: number
  panelHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  panelWidth: 360,
  panelHeight: 0,
})

const layoutRef = ref<HTMLDivElement | null>(null)
const { width: layoutWidth, height: layoutHeight } = useElementSize(layoutRef)

const dockedEdge = useStorage<'top' | 'left' | 'right' | 'bottom' | null>('pr:dockedEdge', 'bottom')
const storedPanelW = useStorage<number>('pr:panelW', props.panelWidth)
const storedPanelH = useStorage<number>('pr:panelH', props.panelHeight)
const storedFloatX = useStorage<number>('pr:floatX', 0)
const storedFloatY = useStorage<number>('pr:floatY', 80)

const panelW = ref(storedPanelW.value)
const panelH = ref(storedPanelH.value)
const floatX = ref(storedFloatX.value)
const floatY = ref(storedFloatY.value)
const previewEdge = ref<'top' | 'left' | 'right' | 'bottom' | null>(null)

// Initialize panelH to 2/3 of layout on first real size (chart:panel = 1:2)
const panelHInitialized = ref(false)
watch(layoutHeight, (h) => {
  if (!panelHInitialized.value && h > 0 && panelH.value === 0) {
    panelH.value = Math.floor(h * 2 / 3)
    storedPanelH.value = panelH.value
    panelHInitialized.value = true
  }
})

const CHART_MIN = 300
const PANEL_MIN_V = 200
const PANEL_MIN_H = 160

const gridClass = computed(() => {
  switch (dockedEdge.value) {
    case 'top': return 'grid-rows-[auto_1fr]'
    case 'bottom': return 'grid-rows-[1fr_auto]'
    case 'left': return 'grid-cols-[auto_1fr]'
    case 'right': return 'grid-cols-[1fr_auto]'
    default: return ''
  }
})

const chartGridClass = computed(() => {
  switch (dockedEdge.value) {
    case 'top': return 'row-start-2'
    case 'bottom': return 'row-start-1'
    case 'left': return 'col-start-2'
    case 'right': return 'col-start-1'
    default: return ''
  }
})

const panelGridClass = computed(() => {
  switch (dockedEdge.value) {
    case 'top': return 'row-start-1'
    case 'bottom': return 'row-start-2'
    case 'left': return 'col-start-1'
    case 'right': return 'col-start-2'
    default: return ''
  }
})

const chartStyle = computed(() => {
  switch (dockedEdge.value) {
    case 'top':
    case 'bottom':
      return { width: '100%', height: `${layoutHeight.value - panelH.value}px` }
    case 'left':
    case 'right':
      return { width: `${layoutWidth.value - panelW.value}px`, height: '100%' }
    default:
      return { width: '100%', height: '100%' }
  }
})

const panelStyle = computed(() => {
  switch (dockedEdge.value) {
    case 'top':
    case 'bottom':
      return { width: '100%', height: `${panelH.value}px` }
    case 'left':
    case 'right':
      return { width: `${panelW.value}px`, height: '100%' }
    default:
      return {}
  }
})

const previewClass = computed(() => {
  if (!previewEdge.value)
    return ''
  switch (previewEdge.value) {
    case 'top': return 'shadow-[inset_0_8px_0_0_rgba(14,165,233,0.35)]'
    case 'bottom': return 'shadow-[inset_0_-8px_0_0_rgba(14,165,233,0.35)]'
    case 'left': return 'shadow-[inset_8px_0_0_0_rgba(14,165,233,0.35)]'
    case 'right': return 'shadow-[inset_-8px_0_0_rgba(14,165,233,0.35)]'
    default: return ''
  }
})

const undockHandleClass = computed(() => {
  switch (dockedEdge.value) {
    case 'top':
      return 'absolute top-0 left-0 right-0 h-6 cursor-grab active:cursor-grabbing flex flex-row items-center justify-center gap-1 z-50 hover:bg-elevated/50 transition-colors rounded-t'
    case 'bottom':
      return 'absolute bottom-0 left-0 right-0 h-6 cursor-grab active:cursor-grabbing flex flex-row items-center justify-center gap-1 z-50 hover:bg-elevated/50 transition-colors rounded-b'
    case 'left':
      return 'absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50 hover:bg-elevated/50 transition-colors rounded-l'
    case 'right':
      return 'absolute right-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50 hover:bg-elevated/50 transition-colors rounded-r'
    default:
      return ''
  }
})

const resizeOrientation = computed(() => {
  return dockedEdge.value === 'top' || dockedEdge.value === 'bottom' ? 'horizontal' : 'vertical'
})

const resizeHandleClass = computed(() => {
  switch (dockedEdge.value) {
    case 'top': return 'absolute bottom-0 left-0 right-0'
    case 'bottom': return 'absolute top-0 left-0 right-0'
    case 'left': return 'absolute right-0 top-0 bottom-0'
    case 'right': return 'absolute left-0 top-0 bottom-0'
    default: return ''
  }
})

const contentPaddingClass = computed(() => {
  switch (dockedEdge.value) {
    case 'top': return 'pt-6'
    case 'bottom': return 'pb-6'
    case 'left': return 'pl-6'
    case 'right': return 'pr-6'
    default: return ''
  }
})

function onResizeMove(delta: number) {
  switch (dockedEdge.value) {
    case 'top':
      panelH.value = Math.max(PANEL_MIN_H, Math.min(panelH.value + delta, layoutHeight.value - CHART_MIN))
      break
    case 'bottom':
      panelH.value = Math.max(PANEL_MIN_H, Math.min(panelH.value - delta, layoutHeight.value - CHART_MIN))
      break
    case 'left':
      panelW.value = Math.max(PANEL_MIN_V, Math.min(panelW.value + delta, layoutWidth.value - CHART_MIN))
      break
    case 'right':
      panelW.value = Math.max(PANEL_MIN_V, Math.min(panelW.value - delta, layoutWidth.value - CHART_MIN))
      break
  }
}

function onResizeEnd() {
  storedPanelW.value = panelW.value
  storedPanelH.value = panelH.value
}

function onFloatDragEnd() {
  storedFloatX.value = floatX.value
  storedFloatY.value = floatY.value
}

// Docked panel undock drag state
let dockedDragging = false
let dockedStartX = 0
let dockedStartY = 0

function onDockedPointerDown(e: PointerEvent) {
  dockedDragging = true
  dockedStartX = e.clientX
  dockedStartY = e.clientY
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
}

function onDockedPointerMove(_e: PointerEvent) {
  // noop: drag threshold is evaluated on pointerup
}

function onDockedPointerUp(e: PointerEvent) {
  if (!dockedDragging)
    return
  dockedDragging = false
  const target = e.currentTarget as HTMLElement
  target.releasePointerCapture(e.pointerId)
  const dx = e.clientX - dockedStartX
  const dy = e.clientY - dockedStartY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > 20) {
    floatX.value = Math.max(8, e.clientX - 40)
    floatY.value = Math.max(8, e.clientY - 40)
    dockedEdge.value = null
  }
}
</script>

<template>
  <div
    ref="layoutRef"
    class="relative w-full h-full overflow-hidden transition-shadow"
    :class="previewClass"
  >
    <!-- Main grid or floating -->
    <div
      class="w-full h-full"
      :class="dockedEdge ? ['grid', gridClass] : ''"
    >
      <!-- Chart area -->
      <div
        class="relative overflow-hidden"
        :class="chartGridClass"
        :style="chartStyle"
      >
        <slot name="chart" />
      </div>

      <!-- Docked panel -->
      <div
        v-if="dockedEdge"
        class="relative bg-muted border-default flex flex-col"
        :class="[panelGridClass, dockedEdge === 'top' || dockedEdge === 'bottom' ? 'border-t border-b' : 'border-l border-r']"
        :style="panelStyle"
      >
        <!-- Undock handle (disabled: drag has bugs) -->
        <div
          v-if="false"
          class="hover:bg-elevated/50 transition-colors"
          :class="undockHandleClass"
          aria-label="Drag panel"
          @pointerdown="onDockedPointerDown"
          @pointermove="onDockedPointerMove"
          @pointerup="onDockedPointerUp"
        >
          <div class="w-0.5 h-5 bg-accented rounded-full" />
          <div class="w-0.5 h-5 bg-accented rounded-full" />
        </div>

        <ResizeHandle
          :orientation="resizeOrientation"
          class="z-40"
          :class="resizeHandleClass"
          @start="() => {}"
          @move="onResizeMove"
          @end="onResizeEnd"
        />

        <div class="flex-1 min-h-0 overflow-hidden" :class="contentPaddingClass">
          <slot name="panel" />
        </div>
      </div>
    </div>

    <!-- Floating panel -->
    <DraggablePanel
      v-if="!dockedEdge"
      v-model:x="floatX"
      v-model:y="floatY"
      :min-x="8"
      :min-y="8"
      @drag-end="onFloatDragEnd"
      @dock="dockedEdge = $event"
      @preview="previewEdge = $event"
    >
      <div
        class="bg-muted border border-default shadow-lg rounded-md flex flex-col max-h-[calc(100vh-80px)]"
        :style="{ width: `${panelW}px` }"
      >
        <slot name="panel" />
      </div>
    </DraggablePanel>
  </div>
</template>
