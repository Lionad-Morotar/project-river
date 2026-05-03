/**
 * createProjectAgent — pi-agent-core Agent 工厂
 *
 * 按 D-01 / D-02 / D-03 / D-19~D-23 实现：
 * - D-01: 使用 `Agent` 类（高层 API），不使用 agentLoop
 * - D-02: 每次调用返回新实例（session-scoped，不复用）
 * - D-03: toolExecution = 'sequential'（DB 串行 + SSE 顺序可预测）
 * - D-19/D-20: DeepSeek via Anthropic-compatible endpoint —
 *             先 getModel('anthropic',...) 再覆盖 baseUrl
 * - D-22: 不设 maxIterations（pi-agent-core 无此参数，由 LLM stopReason 决定）
 * - D-23: convertToLlm = identity passthrough（无 custom AgentMessage 类型）
 */

import type { AgentMessage, StreamFn } from '@mariozechner/pi-agent-core'
import type { Message } from '@mariozechner/pi-ai'
import { Agent } from '@mariozechner/pi-agent-core'
import { getModel } from '@mariozechner/pi-ai'
import { AGENT_SYSTEM_PROMPT } from './systemPrompt'
import { buildTools } from './toolAdapters'

export interface CreateProjectAgentConfig {
  apiKey: string
  baseUrl: string
  /**
   * 可选：注入自定义 streamFn 用于测试隔离（替代 pi-ai streamSimple）。
   * 生产环境留空，pi-agent-core 默认使用 streamSimple。
   */
  streamFn?: StreamFn
}

/**
 * 创建 project-scoped Agent 实例
 *
 * @param projectId 用于注入 tool 的 projectId（LLM 不可见）
 * @param config    LLM 凭据（apiKey + baseUrl）+ 可选 streamFn（测试注入）
 */
export function createProjectAgent(
  projectId: number,
  config: CreateProjectAgentConfig,
): Agent {
  // DeepSeek API 通过 Anthropic-compatible endpoint 提供。
  // Phase 1 spike 验证：getModel('anthropic', 'claude-sonnet-4-6') 后覆盖 baseUrl。
  // 用 spread 创建新对象避免改写共享 model 实例。
  const baseModel = getModel('anthropic', 'claude-sonnet-4-6')
  const model = { ...baseModel, baseUrl: config.baseUrl }

  return new Agent({
    initialState: {
      systemPrompt: AGENT_SYSTEM_PROMPT,
      model,
      tools: buildTools(projectId),
    },
    // identity passthrough — 当前场景 AgentMessage 等价于 Message（D-23）
    convertToLlm: (messages: AgentMessage[]) => messages as Message[],
    getApiKey: () => config.apiKey,
    toolExecution: 'sequential',
    ...(config.streamFn ? { streamFn: config.streamFn } : {}),
  })
}
