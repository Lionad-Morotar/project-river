import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'

export type Edge = 'top' | 'left' | 'right' | 'bottom'
export type DockedEdge = Edge | null

export interface PanelDragState {
  isDragging: boolean
  dropEdge: Edge | null
}

export function usePanelDrag(elementRef: Ref<HTMLElement | null>) {
  const isDragging = ref(false)
  const dropEdge = shallowRef<Edge | null>(null)
  let cleanup: (() => void) | null = null

  onMounted(() => {
    const el = elementRef.value
    if (!el)
      return

    const d = draggable({
      element: el,
      getInitialData: () => ({ type: 'panel' }),
      onDragStart: () => {
        isDragging.value = true
      },
      onDrop: () => {
        isDragging.value = false
        dropEdge.value = null
      },
    })

    cleanup = () => d()
  })

  onUnmounted(() => {
    cleanup?.()
  })

  function setDropEdge(edge: Edge | null) {
    dropEdge.value = edge
  }

  return {
    isDragging,
    dropEdge,
    setDropEdge,
  }
}

type Ref<T> = import('vue').Ref<T>
