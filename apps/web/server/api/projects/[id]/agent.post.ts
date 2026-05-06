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
 *
 * Gap closure (Phase 3 review)：
 *   - 监听 req 'close' → agent.abort()，client 断开后立即停止消耗 LLM token / DB 连接
 *   - pushSse 在 res.writableEnded / destroyed 后静默丢弃，避免 ERR_STREAM_WRITE_AFTER_END
 *   - `ended` 守卫防止 timeout / error / agent_end 之间事件竞态产生重复 done/error
 *   - stopReason 通过 role 类型守卫识别（不再用裸 `'in' operator + as cast`）
 *   - error 消息归一化为白名单分类，避免泄露 baseUrl / apiKey 片段
 */

import type { AgentEvent } from '@mariozechner/pi-agent-core'
import type { AssistantMessage, Message } from '@mariozechner/pi-ai'
import { createProjectAgent } from '#server/agent/createAgent'
import { createChatLogger } from '#server/utils/chatLogger'
import { assertProjectExists } from '#server/utils/projectStats'
import { createError, defineEventHandler, getRouterParam, readBody, setHeader } from 'h3'

/** SSE event JSON 形态（type 字段区分种类，对应 D-07） */
type SseEventType = 'text' | 'tool-call' | 'tool-result' | 'done' | 'error'

interface SseEvent {
  type: SseEventType
  [key: string]: unknown
}

/** node http response 的子集（write/end/状态查询），便于测试桩对齐 */
interface SseSink {
  write: (chunk: string) => unknown
  end?: () => unknown
  writableEnded?: boolean
  destroyed?: boolean
}

/**
 * 写一行 SSE data:行（JSON 编码避免响应分裂攻击 — T-03-02）
 *
 * 双重防御：
 *   1) 写前检查 res.writableEnded / destroyed（client 已断开时直接丢弃）
 *   2) write 自身 try/catch，吞 ERR_STREAM_WRITE_AFTER_END 等末端错误
 */
function pushSse(res: SseSink, payload: SseEvent): void {
  if (res.writableEnded || res.destroyed)
    return
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  catch {
    // stream 已关闭/异常 — 丢弃，由调用方的 ended 守卫保证不再继续推
  }
}

/**
 * AssistantMessage 类型守卫
 *
 * `message_end.message` 是 `AgentMessage = Message | custom`；
 * 仅当 role === 'assistant' 时访问 stopReason / errorMessage 才类型安全。
 */
function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return (
    typeof msg === 'object'
    && msg !== null
    && (msg as Message).role === 'assistant'
  )
}

/**
 * LLM 错误消息归一化（防 baseUrl / apiKey 泄露）
 *
 * 上游 errorMessage 可能含 fetch 异常的完整 URL 或 header 片段；
 * 这里映射到一组确定性分类字符串。无法识别的错误一律降级为 'LLM API error'。
 */
function normalizeLlmError(raw: string | undefined): string {
  if (!raw)
    return 'LLM API error'
  const lower = raw.toLowerCase()
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'LLM API timeout'
  if (lower.includes('rate limit') || lower.includes('rate_limit') || lower.includes('429'))
    return 'LLM API rate limit'
  if (lower.includes('invalid_request') || lower.includes('invalid request') || lower.includes('400'))
    return 'LLM API invalid request'
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('403'))
    return 'LLM API unauthorized'
  return 'LLM API error'
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
  const logger = createChatLogger(projectId)
  logger.log('user-message', { message })
  const res = event.node.res as SseSink
  const req = event.node.req as { once?: (ev: string, cb: () => void) => void, off?: (ev: string, cb: () => void) => void }

  /**
   * `ended` 守卫 — 一次 run 只允许产生一个终止事件（done | error）。
   *
   * 竞态场景：timeout fires 后 agent.abort() 仍可能让 pi-agent-core 异步发出
   * agent_end，再叠加 finally 兜底 → 客户端收到 error+done 两次终止 → 协议被破坏。
   * 任何写终止事件 / 终止后续事件的路径都先检查并设置该标记。
   */
  let ended = false

  // ── 4. Client disconnect → abort agent（FIX 1） ──
  // chrome 中断 / fetch.abort() 会触发 req 'close'。此时停止 agent 避免继续吃 LLM token / DB。
  const onClientClose = (): void => {
    ended = true
    try {
      agent.abort()
    }
    catch {
      // 兜底，pi-agent-core 在 idle 状态下 abort 是安全 no-op
    }
  }
  req.once?.('close', onClientClose)

  // ── 5. 订阅 lifecycle event → 推 SSE（D-07~D-10/D-16） ──
  agent.subscribe((agentEvent: AgentEvent) => {
    if (ended)
      return

    logger.log(`agent-${agentEvent.type}`, agentEvent)

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
        if (isAssistantMessage(msg) && msg.stopReason === 'error') {
          ended = true
          pushSse(res, { type: 'error', message: normalizeLlmError(msg.errorMessage) })
        }
        break
      }
      case 'agent_end': {
        // D-10: done event（最后一个事件）
        ended = true
        pushSse(res, { type: 'done' })
        break
      }
    }
  })

  // ── 6. 启动 + 60s timeout（D-17） ──
  const timeout = setTimeout(() => {
    if (ended)
      return
    ended = true
    try {
      agent.abort()
    }
    catch { /* no-op */ }
    pushSse(res, { type: 'error', message: 'Request timeout' })
  }, TIMEOUT_MS)

  try {
    await agent.prompt(message)
    await agent.waitForIdle()
  }
  catch (err) {
    // 兜底：prompt/waitForIdle 出现意外异常时也推 error event
    if (!ended) {
      ended = true
      const raw = err instanceof Error ? err.message : undefined
      pushSse(res, { type: 'error', message: normalizeLlmError(raw) })
    }
  }
  finally {
    clearTimeout(timeout)
    req.off?.('close', onClientClose)
    logger.close()
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end?.()
      }
      catch { /* no-op */ }
    }
  }
})
