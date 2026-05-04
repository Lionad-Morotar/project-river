import { mount } from '@vue/test-utils'
// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createI18n, useI18n } from 'vue-i18n'
import AgentToolCard from '~/components/AgentToolCard.vue'

// i18n messages for testing
const zhMessages = {
  agent: {
    toolcard: {
      input: '输入参数',
      output: '返回结果',
      step: 'Step {n}',
      duration: '{n}ms',
    },
  },
}

const enMessages = {
  agent: {
    toolcard: {
      input: 'Input',
      output: 'Output',
      step: 'Step {n}',
      duration: '{n}ms',
    },
  },
}

function createI18nPlugin(locale: string) {
  return createI18n({
    legacy: false,
    locale,
    messages: {
      'zh-CN': zhMessages,
      'en': enMessages,
    },
  })
}

const baseProps = {
  name: 'queryContributors',
  input: { sortBy: 'commits', limit: 5 },
  output: [{ name: 'alice', commits: 42 }],
  isError: false,
  status: 'done' as const,
  index: 1,
  duration: 120,
}

describe('agentToolCard', () => {
  beforeAll(() => {
    // Nuxt auto-imports these globally; stub them for vitest
    vi.stubGlobal('useI18n', useI18n)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
  })

  it('renders collapsed by default', () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: baseProps,
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    // Header visible
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Step 1')
    expect(wrapper.text()).toContain('queryContributors')

    // Body hidden
    const body = wrapper.find('[id^="tool-body-"]')
    expect(body.isVisible()).toBe(false)
  })

  it('expands on header click', async () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: baseProps,
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    await wrapper.find('button').trigger('click')

    const body = wrapper.find('[id^="tool-body-"]')
    expect(body.isVisible()).toBe(true)
    expect(body.text()).toContain('输入参数')
    expect(body.text()).toContain('返回结果')
    expect(body.text()).toContain('"sortBy"')
    expect(body.text()).toContain('"alice"')
  })

  it('collapses on second header click', async () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: baseProps,
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    await wrapper.find('button').trigger('click')
    await wrapper.find('button').trigger('click')

    const body = wrapper.find('[id^="tool-body-"]')
    expect(body.isVisible()).toBe(false)
  })

  it('renders JSON in pretty-print format', async () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: baseProps,
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    await wrapper.find('button').trigger('click')

    const pre = wrapper.findAll('pre')
    expect(pre.length).toBeGreaterThanOrEqual(2)
    // Pretty-print uses 2-space indent
    expect(pre[0].text()).toContain('  ')
  })

  it('shows error border and badge when isError is true', () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: { ...baseProps, isError: true },
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    const container = wrapper.find('div').element
    expect(container.className).toContain('border-red-500')
    expect(wrapper.text()).toContain('Error')
  })

  it('shows spinner when status is running', () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: { ...baseProps, status: 'running' },
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    expect(wrapper.find('[class*="animate-spin"]').exists()).toBe(true)
    // Chevron should NOT be present when running
    expect(wrapper.find('[class*="chevron"]').exists()).toBe(false)
  })

  it('switches i18n labels when locale changes', async () => {
    const i18n = createI18nPlugin('zh-CN')
    const wrapper = mount(AgentToolCard, {
      props: baseProps,
      global: {
        plugins: [i18n],
        stubs: { UIcon: true },
      },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('输入参数')

    // Switch locale
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Input')
    expect(wrapper.text()).toContain('Output')
  })
})
