import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { usePanelDrag } from '~/composables/usePanelDrag'

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: vi.fn(() => () => {}),
}))

describe('usePanelDrag', () => {
  it('returns reactive isDragging and dropEdge', () => {
    const el = document.createElement('div')
    const elementRef = ref(el)
    const { isDragging, dropEdge, setDropEdge } = usePanelDrag(elementRef)

    expect(isDragging.value).toBe(false)
    expect(dropEdge.value).toBeNull()

    setDropEdge('left')
    expect(dropEdge.value).toBe('left')
  })
})
