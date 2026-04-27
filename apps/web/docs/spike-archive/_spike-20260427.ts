import { defineEventHandler, setHeader } from 'h3'
import { getModel, streamSimple } from '@mariozechner/pi-ai'

/**
 * pi-mono SSE hello-world spike — throwaway probe for Phase 1 PRE-01
 * 通过后立即删除或归档到 docs/spike-archive/
 *
 * pi-ai API 实测 (0.70.2):
 * - streamSimple(model, context, options) → AssistantMessageEventStream
 * - eventStream 是 AsyncIterable<AssistantMessageEvent>
 * - text_delta 事件的 delta 字段包含 token 文本片段
 */
export default defineEventHandler(async (event) => {
  // 1. SSE 响应头
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  // 2. 读取 server-only API key（不暴露给 client）
  const config = useRuntimeConfig()
  const apiKey = config.agentLlmApiKey as string | undefined
  if (!apiKey) {
    event.node.res.write('data: {"error":"NUXT_AGENT_LLM_API_KEY not configured"}\n\n')
    event.node.res.end()
    return
  }

  // 3. 调用 pi-ai streamSimple
  // 提示词: "用一句俳句的形式说 hello world" — 输出 ~30 token，多条可观察 streaming
  try {
    const model = getModel('anthropic', 'claude-sonnet-4-6')
    const eventStream = streamSimple(
      model,
      {
        messages: [
          { role: 'user', content: '用一句俳句的形式说 hello world', timestamp: Date.now() },
        ],
      },
      { apiKey },
    )

    // 4. 流式推送到 SSE
    for await (const ev of eventStream) {
      if (ev.type === 'text_delta') {
        event.node.res.write(`data: ${JSON.stringify({ token: ev.delta })}\n\n`)
      }
      else if (ev.type === 'error') {
        // pi-ai error 事件: { type: 'error', reason: 'error', error: AssistantMessage }
        const errMsg = (ev.error as any).errorMessage ?? 'unknown error'
        event.node.res.write(`data: {"error":"${errMsg}"}\n\n`)
        event.node.res.end()
        return
      }
    }

    // 5. 结束标记
    event.node.res.write('data: {"done":true}\n\n')
    event.node.res.end()
  }
  catch (err: any) {
    event.node.res.write(`data: {"error":"${err.message}"}\n\n`)
    event.node.res.end()
  }
})
