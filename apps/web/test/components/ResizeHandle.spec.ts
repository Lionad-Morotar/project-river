import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ResizeHandle from '~/components/ResizeHandle.vue'

describe('resizeHandle', () => {
  it('emits start/move/end on pointer drag', () => {
    const wrapper = mount(ResizeHandle, {
      props: { orientation: 'vertical' },
    })

    const el = wrapper.element as HTMLElement

    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }))
    expect(wrapper.emitted('start')).toHaveLength(1)

    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 0, bubbles: true }))
    expect(wrapper.emitted('move')).toHaveLength(1)
    expect(wrapper.emitted('move')![0]).toEqual([10])

    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    expect(wrapper.emitted('end')).toHaveLength(1)
  })

  it('emits move with delta on keyboard arrows', async () => {
    const wrapper = mount(ResizeHandle, {
      props: { orientation: 'horizontal' },
    })

    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('move')).toHaveLength(1)
    expect(wrapper.emitted('move')![0]).toEqual([10])
    expect(wrapper.emitted('end')).toHaveLength(1)

    await wrapper.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('move')).toHaveLength(2)
    expect(wrapper.emitted('move')![1]).toEqual([-10])
  })

  it('applies vertical class when orientation is vertical', () => {
    const wrapper = mount(ResizeHandle, {
      props: { orientation: 'vertical' },
    })
    expect(wrapper.classes()).toContain('cursor-col-resize')
    expect(wrapper.classes()).toContain('w-1.5')
  })

  it('applies horizontal class when orientation is horizontal', () => {
    const wrapper = mount(ResizeHandle, {
      props: { orientation: 'horizontal' },
    })
    expect(wrapper.classes()).toContain('cursor-row-resize')
    expect(wrapper.classes()).toContain('h-1.5')
  })
})
