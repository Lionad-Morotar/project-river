/**
 * POST /api/projects/[id]/agent — Agent SSE Route
 *
 * 实现 AGENT-02：将 pi-agent-core Agent 的 lifecycle event 映射为 SSE JSON 推送。
 *
 * SSE 事件合约（D-07~D-10，与 Phase 1 spike 一致）：
 *   data: {"type":"text","token":"..."}
 *   data: {"type":"tool-call","id":"...","name":"...","args":{...}}
 *   data: {"type":"tool-result","id":"...","name":"...","result":{...},"isError":false}
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 *
 * Fail-fast（D-18）：project ID 非法 / API key 缺失 / message 缺失
 * 在 SSE headers 之前抛 createError，返回标准 HTTP 4xx/5xx。
 *
 * Timeout（D-17）：60s AbortController + agent.abort()。
 */

import type { AgentEvent } from '@mariozechner/pi-agent-core'
import { createError, defineEventHandler, getRouterParam, readBody, setHeader } from 'h3'
import { createProjectAgent } from '~/server/agent/createAgent'
import { assertProjectExists } from '~/server/utils/projectStats'

/** SSE event JSON 形态（type 字段区分种类，对应 D-07） */
type SseEventType = 'text' | 'tool-call' | 'tool-result' | 'done' | 'error'

interface SseEvent {
  type: SseEventType
  [key: string]: unknown
}

/** 写一行 SSE data:行（JSON 编码避免响应分裂攻击 — T-03-02） */
function pushSse(res: { write: (chunk: string) => void }, payload: SseEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const TIMEOUT_MS = 60_000

export default defineEventHandler(async (event) => {
  // ── 1. Fail-fast 校验（D-06 / D-18 / T-03-01） ──
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const config = useRuntimeConfig()
  const apiKey = config.agentLlmApiKey as string | undefined
  if (!apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'LLM API key not configured' })
  }

  const body = await readBody<{ message?: unknown }>(event)
  const rawMessage = body?.message
  if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'message is required' })
  }
  const message = rawMessage.trim()

  // 项目存在性 — 不存在抛 404（fail fast，不进入 SSE 流）
  await assertProjectExists(projectId)

  // ── 2. SSE headers（D-07，与 Phase 1 spike 一致） ──
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  // ── 3. 创建 Agent（D-01/D-02/D-19~D-21） ──
  const baseUrl = (config.agentLlmBaseUrl as string | undefined) ?? ''
  const agent = createProjectAgent(projectId, { apiKey, baseUrl })
  const res = event.node.res

  // ── 4. 订阅 lifecycle event → 推 SSE（D-07~D-10/D-16） ──
  agent.subscribe((agentEvent: AgentEvent) => {
    switch (agentEvent.type) {
      case 'message_update': {
        // D-08: 仅转发 text_delta 增量（toolcall_* 由 tool_execution_* 覆盖）
        const ev = agentEvent.assistantMessageEvent
        if (ev.type === 'text_delta') {
          pushSse(res, { type: 'text', token: ev.delta })
        }
        break
      }
      case 'tool_execution_start': {
        // D-09: tool-call event
        pushSse(res, {
          type: 'tool-call',
          id: agentEvent.toolCallId,
          name: agentEvent.toolName,
          args: agentEvent.args,
        })
        break
      }
      case 'tool_execution_end': {
        // D-09: tool-result event（含 isError 标记，graceful degrade by D-15）
        pushSse(res, {
          type: 'tool-result',
          id: agentEvent.toolCallId,
          name: agentEvent.toolName,
          result: agentEvent.result,
          isError: agentEvent.isError,
        })
        break
      }
      case 'message_end': {
        // D-10/D-16: LLM API error → SSE error event
        const msg = agentEvent.message
        if (
          msg
          && typeof msg === 'object'
          && 'stopReason' in msg
          && (msg as { stopReason?: string }).stopReason === 'error'
        ) {
          const errorMessage = (msg as { errorMessage?: string }).errorMessage ?? 'LLM API error'
          pushSse(res, { type: 'error', message: errorMessage })
        }
        break
      }
      case 'agent_end': {
        // D-10: done event（最后一个事件）
        pushSse(res, { type: 'done' })
        break
      }
    }
  })

  // ── 5. 启动 + 60s timeout（D-17） ──
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    agent.abort()
    pushSse(res, { type: 'error', message: 'Request timeout' })
  }, TIMEOUT_MS)

  try {
    await agent.prompt(message)
    await agent.waitForIdle()
  }
  catch (err) {
    // 兜底：prompt/waitForIdle 出现意外异常时也推 error event
    if (!timedOut) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected agent error'
      pushSse(res, { type: 'error', message: errorMessage })
    }
  }
  finally {
    clearTimeout(timeout)
    res.end()
  }
})
