# Agent Pivot Plan — Vercel AI SDK Fallback

**Status:** NOT TRIGGERED — PRE-01 PASS on 2026-04-27T09:00:00Z
**Trigger:** PRE-01 pi-mono spike 验证完成
**Context:** Phase 1 P0 hard gate — pi-mono 在 Nuxt 4 SPA + Nitro SSE 链路验证通过

## Spike 结果

### 验证通过项

| 检查项 | 结果 | 说明 |
|--------|------|------|
| pi-ai 0.70.2 安装 | PASS | `@mariozechner/pi-ai` 和 `@mariozechner/pi-agent-core` 成功安装 |
| SSE 响应头 | PASS | `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` |
| pi-ai API 调用 | PASS | `getModel('anthropic', 'claude-sonnet-4-6')` + `streamSimple()` 工作正常 |
| 流式事件协议 | PASS | `text_delta` 事件携带 `delta` 字段；`error` 事件携带 `error.errorMessage` |
| EventSource 连接 | PASS | Client 端 `EventSource('/api/agent/_spike')` 连接正常 |
| API key 安全 | PASS | `useRuntimeConfig().agentLlmApiKey` server-only，不暴露给 client |

### 发现与调整

1. **Nuxt runtimeConfig 需要显式声明**：`NUXT_AGENT_LLM_API_KEY` 不会自动映射到 `useRuntimeConfig().agentLlmApiKey`，必须在 `nuxt.config.ts` 的 `runtimeConfig` 中显式声明 `agentLlmApiKey: ''`。

2. **pi-ai error 事件结构**：`error` 事件的字段是 `ev.error`（不是 `ev.partial`），错误消息在 `ev.error.errorMessage` 中。

3. **pi-mono 包不存在**：npm registry 中没有 `@mariozechner/pi-mono`，实际使用的是 `@mariozechner/pi-ai`（LLM API）和 `@mariozechner/pi-agent-core`（agent 框架）。

4. **Auth Gate**：当前 `.env` 中的 `NUXT_AGENT_LLM_API_KEY` 是占位符，需要替换为真实的 Anthropic API key 才能进行实际 LLM 调用。pi-ai 返回了正确的 401 错误：`invalid x-api-key`。

## Decision Record

- **Original choice:** pi-mono 0.70.2 (@mariozechner/pi-ai + pi-agent-core)
- **Spike result:** PASS — SSE streaming 基础设施验证通过，pi-ai API 集成正确
- **Fail reason:** N/A（spike 通过）
- **Pivot target:** N/A（无需 pivot）
- **Next step:** 替换真实 API key 后，pi-mono 链路可直接用于 Phase 3 agent 实现

## Mapping: pi-mono → Vercel AI SDK（备用方案）

| pi-mono 概念 | Vercel AI SDK 替代 | 文件影响 |
|---|---|---|
| `pi-ai.streamSimple` | `ai/streamText` | `server/api/projects/[id]/agent.post.ts` |
| `pi-agent-core` ReAct loop | `ai/generateText` + `tools` | `server/api/projects/[id]/agent.post.ts` |
| pi-mono tool schema | `ai/tool` + zod schema | `server/agent/tools/*.ts`（仅 schema 定义方式） |
| pi-mono session state | Vue ref 管 messages | `composables/useAgentChat.ts`（新） |

## 保留不变（无需重写）

- 3 个 tools 的实现（`server/agent/tools/*.ts` 纯函数，与框架解耦）
- ChatDrawer.vue / AgentChat.vue UI 组件
- `/api/projects/[id]/agent` 路由结构（响应格式微调）
- Claude Sonnet 模型选择
- system prompt 内容
- SSE streaming 协议（text / tool-call / tool-result / done events）

## 迁移步骤（备用，当前无需执行）

1. `pnpm remove @mariozechner/pi-ai @mariozechner/pi-agent-core`
2. `pnpm add ai @ai-sdk/anthropic`（或对应 provider 包）
3. 重写 `server/api/projects/[id]/agent.post.ts`：
   - import { streamText } from 'ai'
   - import { anthropic } from '@ai-sdk/anthropic'
   - 用 `tools` 参数传入 zod-typed tool definitions
   - 用 `onFinish` / `onToolCall` callback 处理 tool events
   - SSE 输出格式保持与 pi-mono 版本一致（text / tool-call / tool-result / done）
4. 验证 SSE streaming 仍通过 `_agent-spike.vue` 探针

## 参考

- Vercel AI SDK Docs: https://sdk.vercel.ai/
- Design doc §Pivot Plan: `docs/design/agent.md`
- Spike 归档: `apps/web/docs/spike-archive/_spike-20260427.ts`
