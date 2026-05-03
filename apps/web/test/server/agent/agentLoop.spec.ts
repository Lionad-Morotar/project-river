/**
 * TEST-02 — Agent ReAct loop integration test
 *
 * 验证 D-24 描述的 3 类断言：
 *   1. happy path: LLM 返回 tool call → tool 执行 → result 反馈给 LLM
 *   2. graceful degrade: tool 抛错 → isError tool result 反馈给 LLM
 *   3. plain text path: LLM 直接返回文本（无 tool call）
 *
 * 隔离策略（D-26）：
 *   - vi.doMock '~/server/agent/toolAdapters' — 注入测试 tool（避免真实 DB 查询）
 *   - vi.doMock '@mariozechner/pi-ai' — 提供轻量 stub（实际 stream 通过 streamFn 注入）
 *   - 通过 createProjectAgent 的 streamFn option 注入 mock streamSimple
 *     （此为最稳的注入方式；pnpm symlink 下 module-level mock 不可靠）
 */

import type { AgentTool } from '@mariozechner/pi-agent-core'
import type { AssistantMessage, AssistantMessageEvent } from '@mariozechner/pi-ai'
import { createAssistantMessageEventStream } from '@mariozechner/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── 共享 mock fn（在不同 it 用例间通过 mockReset 重置） ──
const streamSimpleMock = vi.fn()
const queryContributorsExec = vi.fn()
const queryCommitsByPathExec = vi.fn()
const queryProjectEventsExec = vi.fn()

// pi-ai mock — 主要为了 grep acceptance；getModel 必须 stub 因为 createProjectAgent 调用它
vi.doMock('@mariozechner/pi-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mariozechner/pi-ai')>()
  return {
    ...actual,
    streamSimple: streamSimpleMock,
    getModel: () => ({
      id: 'mock-model',
      name: 'Mock',
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'http://mock',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 4096,
    }),
  }
})

// toolAdapters mock — 替换真实 buildTools，避免触发 DB tool
vi.doMock('~/server/agent/toolAdapters', () => ({
  buildTools: (_projectId: number): AgentTool[] => [
    {
      name: 'queryContributors',
      label: 'queryContributors',
      description: 'mock',
      parameters: { type: 'object', properties: {} } as any,
      execute: queryContributorsExec,
    },
    {
      name: 'queryCommitsByPath',
      label: 'queryCommitsByPath',
      description: 'mock',
      parameters: { type: 'object', properties: {} } as any,
      execute: queryCommitsByPathExec,
    },
    {
      name: 'queryProjectEvents',
      label: 'queryProjectEvents',
      description: 'mock',
      parameters: { type: 'object', properties: {} } as any,
      execute: queryProjectEventsExec,
    },
  ],
}))

// ── 动态 import 被测对象（必须在 doMock 之后） ──
const { createProjectAgent } = await import('~/server/agent/createAgent')

// ── helpers ──

/** 构造 AssistantMessage（partial / done.message / error.error 共用） */
function makeAssistantMessage(opts: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'anthropic-messages' as any,
    provider: 'anthropic' as any,
    model: 'mock-model',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } as any,
    stopReason: 'stop' as any,
    timestamp: Date.now(),
    ...opts,
  } as AssistantMessage
}

/** 构造 AssistantMessageEventStream（真正的 EventStream，含 .result() 方法） */
function createEventStream(
  events: AssistantMessageEvent[],
  finalMessage: AssistantMessage,
) {
  const stream = createAssistantMessageEventStream()
  // 立即 push + end —— pi-agent-core 会 for-await 消费
  for (const ev of events) stream.push(ev)
  stream.end(finalMessage)
  return stream
}

describe('agent ReAct loop integration', () => {
  beforeEach(() => {
    streamSimpleMock.mockReset()
    queryContributorsExec.mockReset()
    queryCommitsByPathExec.mockReset()
    queryProjectEventsExec.mockReset()
  })

  it('triggers tool call → tool execution → result fed back to LLM (happy path)', async () => {
    // tool 返回 AgentToolResult 形态（pi-agent-core types.d.ts L259）
    queryContributorsExec.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[{"name":"alice","commits":42}]' }],
      details: [{ name: 'alice', commits: 42 }],
    })

    const toolCall = {
      type: 'toolCall' as const,
      id: 'tc1',
      name: 'queryContributors',
      arguments: { sortBy: 'commits', limit: 5 },
    }
    const toolCallMessage = makeAssistantMessage({
      content: [toolCall as any],
      stopReason: 'toolUse' as any,
    })
    const finalMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'Alice has 42 commits.' } as any],
      stopReason: 'stop' as any,
    })

    streamSimpleMock
      .mockReturnValueOnce(createEventStream([
        { type: 'start', partial: toolCallMessage } as any,
        { type: 'toolcall_end', contentIndex: 0, toolCall, partial: toolCallMessage } as any,
        { type: 'done', reason: 'toolUse', message: toolCallMessage } as any,
      ], toolCallMessage))
      .mockReturnValueOnce(createEventStream([
        { type: 'start', partial: finalMessage } as any,
        { type: 'text_delta', contentIndex: 0, delta: 'Alice has 42 commits.', partial: finalMessage } as any,
        { type: 'done', reason: 'stop', message: finalMessage } as any,
      ], finalMessage))

    const agent = createProjectAgent(1, {
      apiKey: 'sk-test',
      baseUrl: 'http://mock',
      streamFn: streamSimpleMock as any,
    })
    await agent.prompt('who are top contributors?')
    await agent.waitForIdle()

    expect(queryContributorsExec).toHaveBeenCalledTimes(1)
    expect(streamSimpleMock).toHaveBeenCalledTimes(2)

    const messages = agent.state.messages
    // 应包含: user message, assistant tool-call message, toolResult message, assistant final message
    const toolResults = messages.filter(m => m.role === 'toolResult')
    expect(toolResults).toHaveLength(1)
    expect((toolResults[0] as any).isError).toBe(false)

    const finalAssistant = messages.find(m => m.role === 'assistant' && (m as any).stopReason === 'stop')
    expect(finalAssistant).toBeTruthy()
  })

  it('graceful degrade — tool error fed back to LLM as isError tool result', async () => {
    // tool 抛错 → pi-agent-core 自动包装为 isError=true 的 ToolResultMessage（D-15）
    queryCommitsByPathExec.mockRejectedValueOnce(new Error('database connection lost'))

    const toolCall = {
      type: 'toolCall' as const,
      id: 'tc-err',
      name: 'queryCommitsByPath',
      arguments: { pathPrefix: 'auth/' },
    }
    const toolCallMessage = makeAssistantMessage({
      content: [toolCall as any],
      stopReason: 'toolUse' as any,
    })
    const finalMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'I couldn\'t query commits, but I can try project events instead.' } as any],
      stopReason: 'stop' as any,
    })

    streamSimpleMock
      .mockReturnValueOnce(createEventStream([
        { type: 'start', partial: toolCallMessage } as any,
        { type: 'toolcall_end', contentIndex: 0, toolCall, partial: toolCallMessage } as any,
        { type: 'done', reason: 'toolUse', message: toolCallMessage } as any,
      ], toolCallMessage))
      .mockReturnValueOnce(createEventStream([
        { type: 'start', partial: finalMessage } as any,
        { type: 'text_delta', contentIndex: 0, delta: (finalMessage.content[0] as any).text, partial: finalMessage } as any,
        { type: 'done', reason: 'stop', message: finalMessage } as any,
      ], finalMessage))

    const agent = createProjectAgent(1, {
      apiKey: 'sk-test',
      baseUrl: 'http://mock',
      streamFn: streamSimpleMock as any,
    })
    await agent.prompt('who touched auth?')
    await agent.waitForIdle()

    // 1) tool 抛错 → 自动包装为 isError 的 toolResult
    const toolResults = agent.state.messages.filter(m => m.role === 'toolResult')
    expect(toolResults).toHaveLength(1)
    expect((toolResults[0] as any).isError).toBe(true)

    // 2) 第二次 LLM 调用（streamFn）收到的 context.messages 中应有该 isError 的 toolResult
    expect(streamSimpleMock).toHaveBeenCalledTimes(2)
    const secondCallContext = streamSimpleMock.mock.calls[1]![1] as { messages: any[] }
    const ctxToolResults = secondCallContext.messages.filter((m: any) => m.role === 'toolResult')
    expect(ctxToolResults.some((m: any) => m.isError === true)).toBe(true)

    // 3) agent 不崩溃，最终给出降级文本
    const finalAssistant = agent.state.messages.find(
      m => m.role === 'assistant' && (m as any).stopReason === 'stop',
    )
    expect(finalAssistant).toBeTruthy()
  })

  it('plain text response — LLM answers without calling tools', async () => {
    const finalMessage = makeAssistantMessage({
      content: [{ type: 'text', text: 'Hello world' } as any],
      stopReason: 'stop' as any,
    })

    streamSimpleMock.mockReturnValueOnce(createEventStream([
      { type: 'start', partial: finalMessage } as any,
      { type: 'text_delta', contentIndex: 0, delta: 'Hello', partial: finalMessage } as any,
      { type: 'text_delta', contentIndex: 0, delta: ' world', partial: finalMessage } as any,
      { type: 'done', reason: 'stop', message: finalMessage } as any,
    ], finalMessage))

    const agent = createProjectAgent(1, {
      apiKey: 'sk-test',
      baseUrl: 'http://mock',
      streamFn: streamSimpleMock as any,
    })
    await agent.prompt('hi')
    await agent.waitForIdle()

    // 仅 1 次 LLM 调用，无 tool 触发
    expect(streamSimpleMock).toHaveBeenCalledTimes(1)
    expect(queryContributorsExec).not.toHaveBeenCalled()
    expect(queryCommitsByPathExec).not.toHaveBeenCalled()
    expect(queryProjectEventsExec).not.toHaveBeenCalled()

    const toolResults = agent.state.messages.filter(m => m.role === 'toolResult')
    expect(toolResults).toHaveLength(0)
  })
})
