import { flushPromises, mount } from '@vue/test-utils'
// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { createI18n, useI18n } from 'vue-i18n'

// Mock fetch-event-source before importing component
vi.doMock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}))

const AgentChat = await import('~/components/AgentChat.vue').then(m => m.default)

// i18n messages
const zhMessages = {
  common: { cancel: '取消', confirm: '确认', retry: '重试' },
  agent: {
    askButton: 'Ask Agent',
    drawer: { title: 'Project Analyst', placeholder: 'Ask about...', minimize: 'Minimize' },
    chip: {
      1: 'Chip 1',
      2: 'Chip 2',
      3: 'Chip 3',
      4: 'Chip 4',
      5: 'Chip 5',
    },
    error: {
      noData: 'No data',
      streamInterrupted: 'Stream interrupted',
      rateLimited: 'Rate limited {n}s',
      costCap: 'Cost cap',
      apiKeyMissing: 'API Key missing',
      inputTooLong: '{n} / 500',
      aborted: 'Aborted',
    },
  },
}

function createI18nPlugin(locale: string) {
  return createI18n({
    legacy: false,
    locale,
    messages: { 'zh-CN': zhMessages },
  })
}

describe('agentChat', () => {
  beforeAll(() => {
    vi.stubGlobal('useI18n', useI18n)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('reactive', reactive)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('nextTick', nextTick)
    vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
  })

  function mountComponent(props = { projectId: 1 }) {
    const i18n = createI18nPlugin('zh-CN')
    return mount(AgentChat, {
      props,
      global: {
        plugins: [i18n],
        stubs: {
          UIcon: true,
          USlideover: {
            props: ['open', 'side', 'dismissible'],
            template: `
              <div v-show="open" data-testid="slideover">
                <slot name="header" />
                <slot name="body" />
              </div>
            `,
          },
          AgentToolCard: {
            props: ['name', 'input', 'output', 'isError', 'status', 'index', 'duration'],
            template: '<div data-testid="tool-card">{{ name }}</div>',
          },
        },
      },
    })
  }

  it('renders FAB button in collapsed state', () => {
    const wrapper = mountComponent()
    const fab = wrapper.find('button[aria-label="Ask Agent"]')
    expect(fab.exists()).toBe(true)
    expect(fab.isVisible()).toBe(true)
  })

  it('expands drawer when FAB is clicked', async () => {
    const wrapper = mountComponent()
    await wrapper.find('button[aria-label="Ask Agent"]').trigger('click')
    const slideover = wrapper.find('[data-testid="slideover"]')
    expect(slideover.isVisible()).toBe(true)
  })

  it('minimizes drawer when minimize button is clicked', async () => {
    const wrapper = mountComponent()
    await wrapper.find('button[aria-label="Ask Agent"]').trigger('click')
    await wrapper.find('button[aria-label="Minimize"]').trigger('click')
    const slideover = wrapper.find('[data-testid="slideover"]')
    expect(slideover.isVisible()).toBe(false)
  })

  it('shows 5 chip buttons when idle and no messages', () => {
    const wrapper = mountComponent()
    const chips = wrapper.findAll('button')
      .filter(b => b.text().startsWith('Chip'))
    expect(chips.length).toBe(5)
  })

  it('sets input value and triggers submit on chip click', async () => {
    const wrapper = mountComponent()
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    expect(chip).toBeDefined()
    await chip!.trigger('click')
    // After chip click, phase becomes streaming
    expect(wrapper.text()).toContain('Chip 1')
  })

  it('disables input when phase is streaming', async () => {
    const wrapper = mountComponent()
    const input = wrapper.find('input')
    expect(input.attributes('disabled')).toBeUndefined()
    // Simulate streaming by clicking a chip
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    await chip!.trigger('click')
    await flushPromises()
    // Input should be disabled during streaming
    const inputAfter = wrapper.find('input')
    expect(inputAfter.attributes('disabled')).toBeDefined()
  })

  it('shows input too long warning at >500 chars', async () => {
    const wrapper = mountComponent()
    const input = wrapper.find('input')
    await input.setValue('x'.repeat(501))
    await flushPromises()
    expect(wrapper.text()).toContain('501 / 500')
    expect(wrapper.find('.text-red-400').exists()).toBe(true)
  })

  it('shows abort button during streaming and switches back to send after abort', async () => {
    const wrapper = mountComponent()
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    await chip!.trigger('click')
    await flushPromises()
    // Should show stop button (square icon)
    const stopBtn = wrapper.findAll('button').find(b => b.attributes('aria-label') === '取消')
    expect(stopBtn).toBeDefined()
    // Click abort
    await stopBtn!.trigger('click')
    await flushPromises()
    // Should show send button again
    const sendBtn = wrapper.findAll('button').find(b => b.attributes('aria-label') === '确认')
    expect(sendBtn).toBeDefined()
  })

  it('shows api-key-missing overlay on 503 response', async () => {
    const { fetchEventSource } = await import('@microsoft/fetch-event-source')
    const mockFetch = vi.mocked(fetchEventSource)
    mockFetch.mockImplementationOnce(async (_url, options) => {
      await options.onopen?.({ status: 503, ok: false, headers: new Headers() } as Response)
    })

    const wrapper = mountComponent()
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    await chip!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('API Key missing')
  })

  it('shows rate-limit banner with countdown on 429 response', async () => {
    const { fetchEventSource } = await import('@microsoft/fetch-event-source')
    const mockFetch = vi.mocked(fetchEventSource)
    mockFetch.mockImplementationOnce(async (_url, options) => {
      const headers = new Headers({ 'retry-after': '5' })
      await options.onopen?.({ status: 429, ok: false, headers } as Response)
    })

    const wrapper = mountComponent()
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    await chip!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Rate limited')
  })

  it('renders user and assistant messages after submit', async () => {
    const { fetchEventSource } = await import('@microsoft/fetch-event-source')
    const mockFetch = vi.mocked(fetchEventSource)
    mockFetch.mockImplementationOnce(async (_url, options) => {
      await options.onopen?.({ status: 200, ok: true, headers: new Headers() } as Response)
      options.onmessage?.({ data: JSON.stringify({ type: 'text', token: 'Hello' }) } as MessageEvent)
      options.onmessage?.({ data: JSON.stringify({ type: 'done' }) } as MessageEvent)
    })

    const wrapper = mountComponent()
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    await chip!.trigger('click')
    await flushPromises()

    // Should have user message and assistant message
    expect(wrapper.text()).toContain('Chip 1') // user message
    expect(wrapper.text()).toContain('Hello') // assistant message
  })

  it('renders tool-call cards when tool events arrive', async () => {
    const { fetchEventSource } = await import('@microsoft/fetch-event-source')
    const mockFetch = vi.mocked(fetchEventSource)
    mockFetch.mockImplementationOnce(async (_url, options) => {
      await options.onopen?.({ status: 200, ok: true, headers: new Headers() } as Response)
      options.onmessage?.({
        data: JSON.stringify({
          type: 'tool-call',
          id: 'tc-1',
          name: 'queryContributors',
          args: { limit: 5 },
        }),
      } as MessageEvent)
      options.onmessage?.({
        data: JSON.stringify({
          type: 'tool-result',
          id: 'tc-1',
          result: [{ name: 'alice' }],
          isError: false,
        }),
      } as MessageEvent)
      options.onmessage?.({ data: JSON.stringify({ type: 'done' }) } as MessageEvent)
    })

    const wrapper = mountComponent()
    const chip = wrapper.findAll('button').find(b => b.text() === 'Chip 1')
    await chip!.trigger('click')
    await flushPromises()

    const toolCards = wrapper.findAll('[data-testid="tool-card"]')
    expect(toolCards.length).toBe(1)
    expect(toolCards[0].text()).toContain('queryContributors')
  })
})
