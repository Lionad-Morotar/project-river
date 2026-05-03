/**
 * Tool adapters — 将 Phase 2 的纯函数 tool 包装为 pi-agent-core `AgentTool` 接口
 *
 * 设计要点（D-11/D-12/D-15）：
 * - 直接手写 typebox schema（与 zod schema 语义等价），不引入 zod→typebox 桥接
 * - projectId 从 route 参数注入（LLM 不应也无法传）
 * - execute() 内不 catch — 让原始异常冒泡，pi-agent-core 会自动包装为
 *   `isError: true` 的 ToolResultMessage 反馈给 LLM（graceful degrade by D-15）
 */

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import type { TSchema } from '@mariozechner/pi-ai'
import type {
  QueryCommitsByPathInput,
  QueryContributorsInput,
  QueryProjectEventsInput,
} from './tools/index'
import { Type } from '@mariozechner/pi-ai'
import {
  queryCommitsByPath,
  queryContributors,
  queryProjectEvents,
} from './tools/index'

// ── typebox parameter schemas（手写，与各 zod schema 语义等价） ──

/** queryContributors parameters — 对应 queryContributorsSchema */
const contributorsParams = Type.Object({
  filter: Type.Optional(Type.Object({
    activeAfter: Type.Optional(Type.String()),
    activeBefore: Type.Optional(Type.String()),
    minCommits: Type.Optional(Type.Number({ minimum: 0 })),
  })),
  sortBy: Type.Optional(Type.Union([
    Type.Literal('commits'),
    Type.Literal('recency'),
    Type.Literal('span'),
  ])),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
})

/** queryProjectEvents parameters — 对应 queryProjectEventsSchema */
const projectEventsParams = Type.Object({
  typeFilter: Type.Optional(Type.Array(Type.Union([
    Type.Literal('contributor_first_commit'),
    Type.Literal('contributor_exit'),
    Type.Literal('activity_spike'),
    Type.Literal('activity_drop'),
    Type.Literal('major_refactor'),
    Type.Literal('commit_milestone'),
    Type.Literal('project_start'),
    Type.Literal('project_archived'),
  ]))),
  dateRange: Type.Optional(Type.Object({
    start: Type.String(),
    end: Type.String(),
  })),
})

/** queryCommitsByPath parameters — 对应 queryCommitsByPathSchema */
const commitsByPathParams = Type.Object({
  pathPrefix: Type.String({ minLength: 1 }),
  dateRange: Type.Optional(Type.Object({
    start: Type.String(),
    end: Type.String(),
  })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
})

/**
 * 通用 adapter — 将 (projectId, params) => Promise<T> 包装为 AgentTool
 *
 * 注意：pi-agent-core 的 AgentToolResult 接口没有 isError 字段（types.d.ts L259-269）。
 * 错误反馈协议是：execute 抛错 → pi-agent-core 自动包装为
 * isError=true 的 ToolResultMessage（参考 types.d.ts L282 注释 "Throw on failure
 * instead of encoding errors in `content`"）。
 */
function adaptTool<TInput, TOutput>(
  name: string,
  description: string,
  parameters: TSchema,
  exec: (projectId: number, params: TInput) => Promise<TOutput>,
  projectId: number,
): AgentTool {
  return {
    name,
    label: name,
    description,
    parameters,
    execute: async (
      _toolCallId: string,
      params: unknown,
    ): Promise<AgentToolResult<TOutput>> => {
      // 不 catch — 抛错由 pi-agent-core 包装为 isError tool result（D-15）
      const result = await exec(projectId, params as TInput)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      }
    },
  }
}

/**
 * buildTools — 为指定 projectId 构造 3 个 AgentTool
 *
 * 每次调用返回独立实例，projectId 闭包注入到 execute() 中，
 * LLM 看到的 schema 不含 projectId 字段。
 */
export function buildTools(projectId: number): AgentTool[] {
  return [
    adaptTool<QueryContributorsInput, unknown>(
      'queryContributors',
      'Query contributor rankings, activity windows, and module associations. Sort by commits, recency, or span. Returns name, email, commits count, first/last commit dates, and top modules.',
      contributorsParams,
      queryContributors,
      projectId,
    ),
    adaptTool<QueryProjectEventsInput, unknown>(
      'queryProjectEvents',
      'Query project timeline events (deterministic events like contributor joins, exits, activity spikes, refactors, milestones). Filter by event type or date range.',
      projectEventsParams,
      queryProjectEvents,
      projectId,
    ),
    adaptTool<QueryCommitsByPathInput, unknown>(
      'queryCommitsByPath',
      'Query commits by file path prefix. Use for "who touched module X" type questions. Returns commit SHA, author, files, and truncated message.',
      commitsByPathParams,
      queryCommitsByPath,
      projectId,
    ),
  ]
}
