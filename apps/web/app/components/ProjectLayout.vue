<script setup lang="ts">
import type { Edge } from '~/composables/usePanelDrag'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useElementSize, useStorage } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'
import DraggablePanel from '~/components/DraggablePanel.vue'
import ResizeHandle from '~/components/ResizeHandle.vue'

interface Props {
  panelWidth?: number
  panelHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  panelWidth: 360,
  panelHeight: 280,
})

const layoutRef = ref<HTMLDivElement | null>(null)
const { width: layoutWidth, height: layoutHeight } = useElementSize(layoutRef)

const dockedEdge = useStorage<'top' | 'left' | 'right' | 'bottom' | null>('pr:dockedEdge', null)
const storedPanelW = useStorage<number>('pr:panelW', props.panelWidth)
const storedPanelH = useStorage<number>('pr:panelH', props.panelHeight)
const storedFloatX = useStorage<number>('pr:floatX', 0)
const storedFloatY = useStorage<number>('pr:floatY', 80)

const panelW = ref(storedPanelW.value)
const panelH = ref(storedPanelH.value)
const floatX = ref(storedFloatX.value)
const floatY = ref(storedFloatY.value)

const dragEdge = shallowRef<Edge | null>(null)

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

function bindDropTarget(el: HTMLElement | null, edge: Edge) {
  if (!el)
    return () => {}
  return dropTargetForElements({
    element: el,
    getData: () => ({ edge }),
    canDrop: args => args.source.data.type === 'panel',
    onDragEnter: () => {
      dragEdge.value = edge
    },
    onDragLeave: () => {
      if (dragEdge.value === edge)
        dragEdge.value = null
    },
    onDrop: (args) => {
      dragEdge.value = null
      if (args.source.data.type === 'panel') {
        dockedEdge.value = edge
      }
    },
  })
}

const topRef = ref<HTMLDivElement | null>(null)
const leftRef = ref<HTMLDivElement | null>(null)
const rightRef = ref<HTMLDivElement | null>(null)
const bottomRef = ref<HTMLDivElement | null>(null)

let cleanupTop: (() => void) | null = null
let cleanupLeft: (() => void) | null = null
let cleanupRight: (() => void) | null = null
let cleanupBottom: (() => void) | null = null

watch(topRef, (el) => {
  cleanupTop?.()
  cleanupTop = bindDropTarget(el, 'top')
}, { immediate: true })
watch(leftRef, (el) => {
  cleanupLeft?.()
  cleanupLeft = bindDropTarget(el, 'left')
}, { immediate: true })
watch(rightRef, (el) => {
  cleanupRight?.()
  cleanupRight = bindDropTarget(el, 'right')
}, { immediate: true })
watch(bottomRef, (el) => {
  cleanupBottom?.()
  cleanupBottom = bindDropTarget(el, 'bottom')
}, { immediate: true })

const dropPreviewClass = computed(() => {
  if (!dragEdge.value)
    return ''
  switch (dragEdge.value) {
    case 'top': return 'border-t-4 border-sky-500'
    case 'bottom': return 'border-b-4 border-sky-500'
    case 'left': return 'border-l-4 border-sky-500'
    case 'right': return 'border-r-4 border-sky-500'
    default: return ''
  }
})
</script>

<template>
  <div ref="layoutRef" class="relative w-full h-full overflow-hidden">
    <!-- Drop handles -->
    <div
      ref="topRef"
      class="absolute top-0 left-0 right-0 h-4 z-30 transition-colors"
      :class="dragEdge === 'top' ? 'bg-sky-500/20' : 'bg-transparent'"
    />
    <div
      ref="leftRef"
      class="absolute top-0 left-0 bottom-0 w-4 z-30 transition-colors"
      :class="dragEdge === 'left' ? 'bg-sky-500/20' : 'bg-transparent'"
    />
    <div
      ref="rightRef"
      class="absolute top-0 right-0 bottom-0 w-4 z-30 transition-colors"
      :class="dragEdge === 'right' ? 'bg-sky-500/20' : 'bg-transparent'"
    />
    <div
      ref="bottomRef"
      class="absolute bottom-0 left-0 right-0 h-4 z-30 transition-colors"
      :class="dragEdge === 'bottom' ? 'bg-sky-500/20' : 'bg-transparent'"
    />

    <!-- Main grid or floating -->
    <div
      class="w-full h-full"
      :class="dockedEdge ? ['grid', gridClass, dropPreviewClass] : ''"
    >
      <!-- Chart area -->
      <div
        class="relative overflow-hidden"
        :style="chartStyle"
      >
        <slot name="chart" />
      </div>

      <!-- Docked panel -->
      <div
        v-if="dockedEdge"
        class="relative bg-slate-900 border-slate-800 flex flex-col"
        :class="dockedEdge === 'top' || dockedEdge === 'bottom' ? 'border-t border-b' : 'border-l border-r'"
        :style="panelStyle"
      >
        <ResizeHandle
          :orientation="dockedEdge === 'top' || dockedEdge === 'bottom' ? 'horizontal' : 'vertical'"
          @start="() => {}"
          @move="onResizeMove"
          @end="onResizeEnd"
        />
        <div class="flex-1 min-h-0 overflow-hidden">
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
    >
      <div
        class="bg-slate-900 border border-slate-800 shadow-lg rounded-md flex flex-col max-h-[calc(100vh-80px)]"
        :style="{ width: `${panelW}px` }"
      >
        <slot name="panel" />
      </div>
    </DraggablePanel>
  </div>
</template>
