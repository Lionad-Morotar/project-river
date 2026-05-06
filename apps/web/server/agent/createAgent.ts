/**
 * createProjectAgent — pi-agent-core Agent 工厂
 *
 * 使用 pi-agent-core Agent 类，session-scoped 实例不复用，
 * toolExecution 串行（DB 串行 + SSE 顺序可预测）。
 * DeepSeek 通过 Anthropic-compatible endpoint — 先 getModel('anthropic',...) 再覆盖 baseUrl。
 * convertToLlm 为 identity passthrough（无 custom AgentMessage 类型）。
 */

import type { AgentMessage, StreamFn } from '@mariozechner/pi-agent-core'
import type { Message } from '@mariozechner/pi-ai'
import process from 'node:process'
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
  // getModel('anthropic', 'claude-sonnet-4-6') 后覆盖 baseUrl。
  // 用 spread 创建新对象避免改写共享 model 实例。
  // Anthropic SDK 0.90.0 + dangerouslyAllowBrowser: true 时不自动发 x-api-key header，
  // 通过 model.headers 强制注入，经 pi-ai mergeHeaders 流入 defaultHeaders。
  // model.id 必须改为 DeepSeek model ID，reasoning 必须关闭，否则 buildParams
  // 会生成 thinking / output_config 等 DeepSeek 不支持的参数导致 400。
  // Claude Code 运行环境注入 ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED 和
  // ANTHROPIC_BASE_URL=http://127.0.0.1:15721，Anthropic SDK 会读取这些变量
  // 并发送错误的 Authorization header，覆盖正确的 X-Api-Key。清除之。
  delete (process.env as Record<string, string>).ANTHROPIC_AUTH_TOKEN
  delete (process.env as Record<string, string>).ANTHROPIC_BASE_URL

  const baseModel = getModel('anthropic', 'claude-sonnet-4-6')
  const model = {
    ...baseModel,
    id: 'deepseek-v4-flash',
    baseUrl: config.baseUrl,
    headers: { 'x-api-key': config.apiKey },
    reasoning: false,
  }

  return new Agent({
    initialState: {
      systemPrompt: AGENT_SYSTEM_PROMPT,
      model,
      tools: buildTools(projectId),
    },
    // identity passthrough — 当前场景 AgentMessage 等价于 Message
    convertToLlm: (messages: AgentMessage[]) => messages as Message[],
    getApiKey: () => config.apiKey,
    toolExecution: 'sequential',
    ...(config.streamFn ? { streamFn: config.streamFn } : {}),
  })
}
