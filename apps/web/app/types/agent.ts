/**
 * Agent 对话相关的共享类型
 *
 * 由 AgentChat.vue 和 agentDemo.ts 共用，避免类型重复定义
 */

/** Agent UI 状态机相位 */
export type AgentPhase = 'idle' | 'streaming' | 'tool-calling' | 'stream-mid-error'
  | 'abort' | 'rate-limit' | 'cost-cap' | 'input-too-long'
  | 'api-key-missing' | 'empty-result'

/** 工具调用项 */
export interface ToolCallItem {
  id: string
  name: string
  input: unknown
  output?: unknown
  isError: boolean
  status: 'running' | 'done'
  index: number
  duration?: number
}

/** 消息片段：text 或 tool，按事件顺序排列 */
export type Part
  = | { type: 'text', content: string }
    | { type: 'tool', toolCall: ToolCallItem }

/** 单条对话消息 */
export interface AgentMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallItem[]
  /** 按事件顺序排列的片段（text/tool 交错），渲染时优先使用 */
  parts?: Part[]
}
