/**
 * TEST-03 — POST /api/projects/[id]/agent SSE route test
 *
 * 验证 D-25 描述的 5 类断言：
 *   1. POST body validation: 空/缺失/非字符串 message → 400
 *   2. project not found: assertProjectExists 抛 404 → 404
 *   3. API key missing: useRuntimeConfig.agentLlmApiKey 缺失 → 503
 *   4. SSE happy path: text → tool-call → tool-result → done 顺序
 *   5. error event: message_end 且 stopReason='error' → SSE error event
 *
 * 隔离策略（D-26）：
 *   - vi.doMock '~/server/agent/createAgent' — 注入 stub Agent（控制事件序列）
 *   - vi.doMock '~/server/utils/projectStats' — 控制 assertProjectExists 行为
 *   - vi.doMock 'h3' — 控制 readBody / setHeader / getRouterParam（注入 mock event）
 *   - globalThis.useRuntimeConfig — Nuxt 自动注入的全局，测试时挂到 globalThis
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock factory state ──
const createProjectAgentMock = vi.fn()
const assertProjectExistsMock = vi.fn()

let mockApiKey: string | undefined = 'sk-test'
let mockBaseUrl: string | undefined = 'http://mock'

// useRuntimeConfig 是 Nuxt auto-import 全局，挂到 globalThis 让 route 拿得到
;(globalThis as any).useRuntimeConfig = () => ({
  agentLlmApiKey: mockApiKey,
  agentLlmBaseUrl: mockBaseUrl,
})

vi.doMock('~/server/agent/createAgent', () => ({
  createProjectAgent: createProjectAgentMock,
}))

vi.doMock('~/server/utils/projectStats', () => ({
  assertProjectExists: assertProjectExistsMock,
}))

// h3 helpers — 拦截 readBody / setHeader / getRouterParam 让它们读 mock event 字段
vi.doMock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    readBody: (event: any) => Promise.resolve(event._body),
    getRouterParam: (event: any, name: string) => event.context?.params?.[name],
    setHeader: (event: any, key: string, value: string) => {
      event._headers[key] = value
    },
  }
})

// ── 动态 import 被测对象（必须在 doMock 之后） ──
const handler = (await import('~/server/api/projects/[id]/agent.post')).default

// ── helpers ──

interface SseMockEvent {
  context: { params: Record<string, string> }
  node: { req: any, res: any }
  _body: any
  _writes: string[]
  _headers: Record<string, string>
}

/** 构造 mock H3 event，捕获 res.write 调用 */
function createSseMockEvent(opts: { id: string, body: any }): SseMockEvent {
  const writes: string[] = []
  const headers: Record<string, string> = {}
  return {
    context: { params: { id: opts.id } },
    node: {
      req: {},
      res: {
        write: (chunk: string) => {
          writes.push(chunk)
          return true
        },
        end: vi.fn(),
        setHeader: (k: string, v: string) => {
          headers[k] = v
        },
      },
    },
    _body: opts.body,
    _writes: writes,
    _headers: headers,
  }
}

/** 构造 stub Agent — subscribe 注册 listener，prompt 通过 listener 派发预录事件序列 */
function buildStubAgent(eventSequence: any[]) {
  let listener: any = null
  return {
    subscribe: (cb: any) => {
      listener = cb
      return () => {}
    },
    prompt: vi.fn(async () => {
      // 同步派发事件序列；listener 可能是 async（subscribe 返回的 Promise<void>|void）
      if (!listener)
        return
      const signal = new AbortController().signal
      for (const ev of eventSequence) await listener(ev, signal)
    }),
    waitForIdle: vi.fn(async () => {}),
    abort: vi.fn(),
  }
}

describe('pOST /api/projects/[id]/agent', () => {
  beforeEach(() => {
    createProjectAgentMock.mockReset()
    assertProjectExistsMock.mockReset()
    mockApiKey = 'sk-test'
    mockBaseUrl = 'http://mock'
  })

  it('returns 400 when message is missing or empty', async () => {
    assertProjectExistsMock.mockResolvedValue(undefined)

    // empty string
    const event1 = createSseMockEvent({ id: '1', body: { message: '' } })
    await expect(handler(event1 as any)).rejects.toMatchObject({ statusCode: 400 })

    // missing field
    const event2 = createSseMockEvent({ id: '1', body: {} })
    await expect(handler(event2 as any)).rejects.toMatchObject({ statusCode: 400 })

    // non-string
    const event3 = createSseMockEvent({ id: '1', body: { message: 123 } })
    await expect(handler(event3 as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns 404 when project does not exist', async () => {
    // 顺序：projectId valid → apiKey valid → message valid → assertProjectExists 抛 404
    assertProjectExistsMock.mockRejectedValue(
      Object.assign(new Error('Project not found'), { statusCode: 404 }),
    )
    const event = createSseMockEvent({ id: '999', body: { message: 'hi' } })
    await expect(handler(event as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 503 when API key missing', async () => {
    mockApiKey = ''
    assertProjectExistsMock.mockResolvedValue(undefined)
    const event = createSseMockEvent({ id: '1', body: { message: 'hi' } })
    await expect(handler(event as any)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('streams SSE events in correct order: text → tool-call → tool-result → done', async () => {
    assertProjectExistsMock.mockResolvedValue(undefined)
    const eventSequence = [
      // 两个 text_delta（route 仅转发 message_update.assistantMessageEvent.type==='text_delta'）
      {
        type: 'message_update',
        message: {},
        assistantMessageEvent: { type: 'text_delta', delta: 'Searching' },
      },
      {
        type: 'message_update',
        message: {},
        assistantMessageEvent: { type: 'text_delta', delta: '...' },
      },
      // tool-call
      {
        type: 'tool_execution_start',
        toolCallId: 'tc1',
        toolName: 'queryContributors',
        args: { limit: 5 },
      },
      // tool-result
      {
        type: 'tool_execution_end',
        toolCallId: 'tc1',
        toolName: 'queryContributors',
        result: [{ name: 'alice' }],
        isError: false,
      },
      // done
      { type: 'agent_end', messages: [] },
    ]
    createProjectAgentMock.mockReturnValue(buildStubAgent(eventSequence))

    const event = createSseMockEvent({ id: '1', body: { message: 'who?' } })
    await handler(event as any)

    const writes = event._writes
    expect(event._headers['Content-Type']).toBe('text/event-stream')

    // 解析 SSE data: 行 → JSON type 字段
    const types = writes.map(w => JSON.parse(w.replace(/^data: /, '').trim()).type)
    expect(types).toEqual(['text', 'text', 'tool-call', 'tool-result', 'done'])

    // tool-call 和 tool-result 通过 id 配对
    const toolCallEvent = JSON.parse(writes[2]!.replace(/^data: /, '').trim())
    expect(toolCallEvent.id).toBe('tc1')
    expect(toolCallEvent.name).toBe('queryContributors')
    expect(toolCallEvent.args).toEqual({ limit: 5 })

    const toolResultEvent = JSON.parse(writes[3]!.replace(/^data: /, '').trim())
    expect(toolResultEvent.id).toBe('tc1')
    expect(toolResultEvent.isError).toBe(false)
    expect(toolResultEvent.result).toEqual([{ name: 'alice' }])

    // text event 用 token 字段（D-08 / 实现合约）
    const firstText = JSON.parse(writes[0]!.replace(/^data: /, '').trim())
    expect(firstText.token).toBe('Searching')
  })

  it('emits error SSE event when LLM stopReason is error', async () => {
    assertProjectExistsMock.mockResolvedValue(undefined)
    const eventSequence = [
      {
        type: 'message_end',
        message: { stopReason: 'error', errorMessage: 'rate limit exceeded' },
      },
      { type: 'agent_end', messages: [] },
    ]
    createProjectAgentMock.mockReturnValue(buildStubAgent(eventSequence))

    const event = createSseMockEvent({ id: '1', body: { message: 'hi' } })
    await handler(event as any)

    const writes = event._writes
    const errorWrite = writes.find(w => w.includes('"type":"error"'))
    expect(errorWrite).toBeDefined()

    const parsed = JSON.parse(errorWrite!.replace(/^data: /, '').trim())
    expect(parsed.type).toBe('error')
    expect(parsed.message).toBe('rate limit exceeded')
  })
})
