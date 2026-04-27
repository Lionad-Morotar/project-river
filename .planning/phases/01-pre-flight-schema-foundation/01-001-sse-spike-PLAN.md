---
phase: 01-pre-flight-schema-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
  - apps/web/server/api/agent/_spike.ts
  - apps/web/app/pages/_agent-spike.vue
  - apps/web/.env
  - apps/web/docs/agent-pivot.md
autonomous: true
requirements:
  - PRE-01
user_setup:
  - service: anthropic
    why: "LLM API key for pi-mono spike"
    env_vars:
      - name: NUXT_AGENT_LLM_API_KEY
        source: "Anthropic Console → API keys → Create key"
    notes: "Claude Sonnet via pi-ai unified interface; key never leaves server"

must_haves:
  truths:
    - "开发者访问 /_agent-spike 页面时，能看到 pi-mono 流式 token 实时出现在页面上"
    - "每个 token 作为独立 SSE event 到达，无 buffering（Network 面板 event-stream 类型，消息间隔 < 100ms）"
    - "NUXT_AGENT_LLM_API_KEY 仅通过 server-side runtimeConfig 读取，不暴露给 client"
    - "如果 spike fail，pivot 文档已写入，另一开发者周一可执行"
  artifacts:
    - path: "apps/web/package.json"
      provides: "pi-mono 0.70.2 exact pin + pi-ai + pi-agent-core dependencies"
      contains: '"@mariozechner/pi-mono": "0.70.2"'
    - path: "apps/web/server/api/agent/_spike.ts"
      provides: "SSE server route: defineEventHandler + text/event-stream headers + pi-ai streamText"
      exports: ["default"]
    - path: "apps/web/app/pages/_agent-spike.vue"
      provides: "EventSource client probe: onmessage console.log + page rendering"
      min_lines: 30
    - path: "apps/web/docs/agent-pivot.md"
      provides: "Vercel AI SDK pivot plan（PRE-01 fail 时启用）"
      contains: "Vercel AI SDK"
  key_links:
    - from: "apps/web/app/pages/_agent-spike.vue"
      to: "/api/agent/_spike"
      via: "new EventSource('/api/agent/_spike')"
      pattern: "EventSource.*api/agent/_spike"
    - from: "apps/web/server/api/agent/_spike.ts"
      to: "pi-ai streamText"
      via: "import from @mariozechner/pi-ai"
      pattern: "pi-ai|streamText"
    - from: "apps/web/server/api/agent/_spike.ts"
      to: "NUXT_AGENT_LLM_API_KEY"
      via: "useRuntimeConfig().agentLlmApiKey"
      pattern: "agentLlmApiKey|NUXT_AGENT_LLM_API_KEY"
---

<objective>
在 ≤ 1h 内完成 pi-mono + Nuxt 4 SPA + Nitro SSE 的 hello-world spike，验证 token 能从 server 流式到达 client EventSource。

Purpose: 这是 weekend 16h 预算之外的 P0 hard gate。pi-mono 在 Nuxt 4 的集成是唯一未经验证的技术假设。提前隔离这个风险，让 weekend 工作全部在确定性轨道上。
Output: 可工作的 SSE streaming 探针（server route + client page）+ pass/fail 判定 + pivot 文档（fail 时启用）。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md
@.planning/phases/01-pre-flight-schema-foundation/01-PATTERNS.md
@docs/design/agent.md

## 关键接口与模式（从 PATTERNS.md 和代码库提取）

### 现有依赖结构（apps/web/package.json）
```json
"dependencies": {
  "@project-river/db": "workspace:*",
  "@project-river/pipeline": "workspace:*",
  "zod": "^3.24.0",
  ...
}
```
外部依赖用 `^`，workspace 用 `workspace:*`。pi-mono 是唯一需要 exact pin 的例外。

### 现有 Nitro route 模式（daily.get.ts）
```typescript
import { createError, defineEventHandler, getRouterParam, setResponseHeader } from 'h3'
export default defineEventHandler(async (event) => {
  // 参数校验
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }
  // 响应头
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return rows
})
```

### Nuxt runtimeConfig 自动映射
Nuxt 自动把 `NUXT_` 前缀环境变量注入 server runtimeConfig（camelCase 转换）。
`NUXT_AGENT_LLM_API_KEY` → `useRuntimeConfig().agentLlmApiKey`，不需要在 nuxt.config.ts 显式声明。

### 全库无 SSE / EventSource / pi-mono 先例
这是 Phase 1 核心风险点，spike 目的就是验证这个假设。

### 下划线前缀页面约定
Nuxt pages 目录下 `_agent-spike.vue` 不会自动生成 route，需手动通过 URL `/_agent-spike` 访问。
Nitro server 目录下 `_spike.ts` 仍会暴露为 `/api/agent/_spike`（无自动排除）。
</context>

<tasks>

<task type="auto">
  <name>Task 1: 安装 pi-mono 依赖并配置 API key</name>
  <files>apps/web/package.json, apps/web/.env</files>
  <read_first>
    - apps/web/package.json（确认当前依赖结构和版本）
    - apps/web/nuxt.config.ts（确认 runtimeConfig 模式）
    - .planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md（PRE-01 决策锁定）
  </read_first>
  <action>
    1. 在 apps/web/package.json 的 `dependencies` 块中添加三项（按字母序插入到现有依赖中）：
       ```json
       "@mariozechner/pi-mono": "0.70.2",
       "@mariozechner/pi-ai": "0.70.2",
       "@mariozechner/pi-agent-core": "0.70.2",
       ```
       在 pi-mono 行上方添加注释（JSON 允许的行注释）：
       ```json
       // pi-mono 系列必须 exact pin（release 频繁，接口可能变）
       ```
    2. 运行 `pnpm install` 安装新依赖。
    3. 在 apps/web/.env 中添加（如果不存在）：
       ```
       NUXT_AGENT_LLM_API_KEY=sk-ant-api03-...
       ```
       如果 .env 文件不存在则创建。
    4. 验证安装：
       - `ls apps/web/node_modules/@mariozechner/pi-mono/package.json` 存在
       - `cat apps/web/node_modules/@mariozechner/pi-mono/package.json | grep '"version"'` 显示 0.70.2
  </action>
  <verify>
    <automated>test -f apps/web/node_modules/@mariozechner/pi-mono/package.json && grep -q '"version": "0.70.2"' apps/web/node_modules/@mariozechner/pi-mono/package.json && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - apps/web/package.json 包含三项 pi-mono 依赖，版本 0.70.2，无 caret
    - pnpm install 成功，node_modules 中包存在且版本正确
    - apps/web/.env 包含 NUXT_AGENT_LLM_API_KEY
  </done>
  <acceptance_criteria>
    - `grep '"@mariozechner/pi-mono": "0.70.2"' apps/web/package.json` 返回匹配行
    - `grep '"@mariozechner/pi-ai": "0.70.2"' apps/web/package.json` 返回匹配行
    - `grep '"@mariozechner/pi-agent-core": "0.70.2"' apps/web/package.json` 返回匹配行
    - `grep -v '\^' apps/web/package.json | grep 'pi-mono\|pi-ai\|pi-agent-core'` 确认无 caret（即版本串不含 `^`）
    - `test -f apps/web/node_modules/@mariozechner/pi-mono/package.json` 为真
    - `grep '"version": "0.70.2"' apps/web/node_modules/@mariozechner/pi-mono/package.json` 返回匹配行
    - `grep 'NUXT_AGENT_LLM_API_KEY' apps/web/.env` 返回匹配行
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: 创建 SSE server route _spike.ts</name>
  <files>apps/web/server/api/agent/_spike.ts</files>
  <read_first>
    - apps/web/server/api/projects/[id]/daily.get.ts（Nitro route 模式参考）
    - .planning/phases/01-pre-flight-schema-foundation/01-PATTERNS.md（SSE 无先例，需发明模式）
  </read_first>
  <action>
    创建 apps/web/server/api/agent/_spike.ts，内容如下：

    ```typescript
    import { defineEventHandler, setHeader } from 'h3'
    import { streamText } from '@mariozechner/pi-ai'

    // pi-mono SSE hello-world spike — throwaway probe for Phase 1 PRE-01
    // 通过后立即删除或归档到 docs/spike-archive/
    export default defineEventHandler(async (event) => {
      // 1. SSE 响应头
      setHeader(event, 'Content-Type', 'text/event-stream')
      setHeader(event, 'Cache-Control', 'no-cache')
      setHeader(event, 'Connection', 'keep-alive')

      // 2. 读取 server-only API key（不暴露给 client）
      const config = useRuntimeConfig()
      const apiKey = config.agentLlmApiKey
      if (!apiKey) {
        event.node.res.write('data: {"error":"NUXT_AGENT_LLM_API_KEY not configured"}\n\n')
        event.node.res.end()
        return
      }

      // 3. 调用 pi-ai streamText（具体 API 以实测为准）
      // 提示词: "用一句俳句的形式说 hello world" — 输出 ~30 token，多条可观察 streaming
      try {
        const result = await streamText({
          model: 'claude-sonnet-4-6',
          apiKey,
          messages: [
            { role: 'user', content: '用一句俳句的形式说 hello world' },
          ],
        })

        // 4. 流式推送到 SSE
        for await (const chunk of result.textStream) {
          event.node.res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`)
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
    ```

    注意：
    - `streamText` 的具体参数形态以 pi-ai 0.70.2 实际 export 为准。如果 import 失败或 API 签名不同，executor 应根据实际报错调整（这是 spike 的核心目的 — 发现接口真相）。
    - 如果 `streamText` 返回的结构不是 `{ textStream: AsyncIterable<string> }`，根据实际结构调整循环逻辑。
    - 如果 pi-ai 没有 `streamText`，尝试 `generateTextStream` 或查看 `node_modules/@mariozechner/pi-ai/dist/` 中的实际 export。
    - 如果 pi-mono 需要不同的初始化方式（如先创建 `AI` 实例），按实际 API 调整。
    - 绝对不在响应中写入 apiKey。
    - 用 `event.node.res.write` 而不是 h3 的 `send` 或 `return`，因为 SSE 需要保持连接并手动 flush。
  </action>
  <verify>
    <automated>grep -q "text/event-stream" apps/web/server/api/agent/_spike.ts && grep -q "agentLlmApiKey" apps/web/server/api/agent/_spike.ts && grep -q "event.node.res.write" apps/web/server/api/agent/_spike.ts && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - apps/web/server/api/agent/_spike.ts 存在且包含 SSE 头设置、apiKey 读取、streamText 调用、res.write 循环、结束标记
    - 文件包含注释说明这是 throwaway spike
    - 无 apiKey 泄露到响应中的代码
  </done>
  <acceptance_criteria>
    - `test -f apps/web/server/api/agent/_spike.ts` 为真
    - `grep -q "Content-Type.*text/event-stream" apps/web/server/api/agent/_spike.ts` 为真
    - `grep -q "Cache-Control.*no-cache" apps/web/server/api/agent/_spike.ts` 为真
    - `grep -q "Connection.*keep-alive" apps/web/server/api/agent/_spike.ts` 为真
    - `grep -q "agentLlmApiKey" apps/web/server/api/agent/_spike.ts` 为真
    - `grep -q "event.node.res.write" apps/web/server/api/agent/_spike.ts` 为真（至少 2 处）
    - `grep -q "done.*true" apps/web/server/api/agent/_spike.ts` 为真
    - `grep -q "throwaway\|spike\|probe" apps/web/server/api/agent/_spike.ts` 为真（注释说明）
    - `grep "apiKey" apps/web/server/api/agent/_spike.ts | grep -v "agentLlmApiKey" | grep -v "//" | wc -l` 返回 0（无 apiKey 字符串泄露）
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: 创建 client spike 页面 _agent-spike.vue</name>
  <files>apps/web/app/pages/_agent-spike.vue</files>
  <read_first>
    - apps/web/app/pages/index.vue（script setup 模式参考）
    - .planning/phases/01-pre-flight-schema-foundation/01-PATTERNS.md（EventSource 无先例）
  </read_first>
  <action>
    创建 apps/web/app/pages/_agent-spike.vue，内容如下：

    ```vue
    <script setup lang="ts">
    // pi-mono SSE client spike — throwaway probe for Phase 1 PRE-01
    // 通过后立即删除或归档到 docs/spike-archive/
    // 访问: http://localhost:10400/_agent-spike

    const messages = ref<string[]>([])
    const status = ref<'idle' | 'streaming' | 'done' | 'error'>('idle')

    onMounted(() => {
      const es = new EventSource('/api/agent/_spike')

      es.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('SSE message:', data)

        if (data.token) {
          messages.value.push(data.token)
          status.value = 'streaming'
        }
        else if (data.done) {
          status.value = 'done'
          es.close()
        }
        else if (data.error) {
          messages.value.push(`ERROR: ${data.error}`)
          status.value = 'error'
          es.close()
        }
      }

      es.onerror = (err) => {
        console.error('EventSource error:', err)
        status.value = 'error'
        es.close()
      }
    })
    </script>

    <template>
      <div class="p-8">
        <h1 class="text-xl font-bold mb-4">
          PRE-01 Spike: pi-mono SSE Streaming
        </h1>
        <p class="mb-4 text-gray-500">
          Status: {{ status }}
        </p>
        <!-- 使用 textContent 渲染，防止 LLM 返回内容中的 XSS -->
        <div class="border rounded p-4 bg-gray-50 dark:bg-gray-900">
          <pre
            v-for="(msg, i) in messages"
            :key="i"
            class="inline"
          >{{ msg }}</pre>
        </div>
      </div>
    </template>
    ```

    注意：
    - 使用 `<pre>` + `{{ msg }}`（Vue 的 textContent 插值），不是 `v-html`，防止 LLM 返回的恶意内容触发 XSS。
    - 无 i18n、无样式系统依赖、无 D3 — 纯探针。
    - underscore 前缀 `_agent-spike.vue` 在 Nuxt pages 下不会自动生成 route，需手动访问 `/_agent-spike`。
    - `onMounted` 中创建 EventSource，确保只在浏览器端执行（SPA 模式下无 SSR 问题，但保留此模式作为良好实践）。
  </action>
  <verify>
    <automated>grep -q "EventSource" apps/web/app/pages/_agent-spike.vue && grep -q "onMounted" apps/web/app/pages/_agent-spike.vue && grep -q "textContent\|{{ msg }}\|pre" apps/web/app/pages/_agent-spike.vue && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - apps/web/app/pages/_agent-spike.vue 存在且包含 EventSource、onMounted、消息渲染
    - 使用 textContent 插值（非 v-html）
    - 有 status 状态跟踪
    - 有 console.log 每个 token
  </done>
  <acceptance_criteria>
    - `test -f apps/web/app/pages/_agent-spike.vue` 为真
    - `grep -q "new EventSource('/api/agent/_spike')" apps/web/app/pages/_agent-spike.vue` 为真
    - `grep -q "onMounted" apps/web/app/pages/_agent-spike.vue` 为真
    - `grep -q "console.log" apps/web/app/pages/_agent-spike.vue` 为真
    - `grep "v-html" apps/web/app/pages/_agent-spike.vue | wc -l` 返回 0（无 v-html）
    - `grep -q "status" apps/web/app/pages/_agent-spike.vue` 为真
    - `grep -q "throwaway\|spike\|probe" apps/web/app/pages/_agent-spike.vue` 为真（注释说明）
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 4: 运行 spike 并判定 Pass/Fail + 写 pivot 文档</name>
  <files>apps/web/docs/agent-pivot.md</files>
  <read_first>
    - apps/web/server/api/agent/_spike.ts（确认 server 代码正确）
    - apps/web/app/pages/_agent-spike.vue（确认 client 代码正确）
    - docs/design/agent.md（§Pivot Plan 映射表）
    - .planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md（Pass/Fail 标准）
  </read_first>
  <action>
    1. 启动 dev server：`pnpm --filter @project-river/web dev`（在后台运行或新开终端）。
    2. 等待 Nuxt 启动完成（控制台出现 `Nuxt 4.x ready` 或 `localhost:10400`）。
    3. 浏览器访问 `http://localhost:10400/_agent-spike`。
    4. 打开 Chrome DevTools → Network 面板，筛选 `agent/_spike`。
    5. 观察：
       - Response Headers 中 `Content-Type` 是否为 `text/event-stream`
       - EventStream 标签页中是否出现多个 message，每个带时间戳
       - 消息间隔是否 < 100ms（肉眼可见的流式效果）
       - 页面上的 `<pre>` 元素是否逐字出现 token
    6. 同时观察控制台是否有 `console.log('SSE message:', ...)` 输出。

    **Pass 判定**（以下全部满足）：
    - [ ] Network 面板显示 `event-stream` 类型（不是 xhr/fetch）
    - [ ] EventStream 标签页显示多条 message，每条一个 token
    - [ ] 页面 token 是逐字出现，不是一次性刷出
    - [ ] 无 CORS / Mixed Content / Content-Type 错误
    - [ ] 无 Nuxt SPA boundary error

    **Fail 判定**（任一满足）：
    - [ ] Token 在 server 缓冲，client 一次性收到全部
    - [ ] Client 报 CORS / Mixed Content / Content-Type 错误
    - [ ] 1h 内无法 resolve 上述问题

    7. **无论 Pass 或 Fail**，创建 apps/web/docs/agent-pivot.md：

    ```markdown
    # Agent Pivot Plan — Vercel AI SDK Fallback

    **Created:** 2026-04-27
    **Trigger:** PRE-01 pi-mono spike FAIL
    **Context:** Phase 1 P0 hard gate — pi-mono 在 Nuxt 4 SPA + Nitro SSE 链路不可用

    ## Decision Record

    - **Original choice:** pi-mono 0.70.2 (@mariozechner/pi-mono + pi-ai + pi-agent-core)
    - **Fail reason:** (由 spike executor 填写: buffering / CORS / API incompatibility / other)
    - **Pivot target:** Vercel AI SDK
    - **Pivot cost:** 1-2 天（weekend 内仍可推进）

    ## Mapping: pi-mono → Vercel AI SDK

    | pi-mono 概念 | Vercel AI SDK 替代 | 文件影响 |
    |---|---|---|
    | `pi-ai.streamText` | `ai/streamText` | `server/api/projects/[id]/agent.post.ts` |
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

    ## 迁移步骤

    1. `pnpm remove @mariozechner/pi-mono @mariozechner/pi-ai @mariozechner/pi-agent-core`
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
    ```

    8. 如果 **Pass**：在 agent-pivot.md 顶部添加 `**Status:** NOT TRIGGERED — PRE-01 PASS on <timestamp>`。
    9. 如果 **Fail**：在 agent-pivot.md 顶部添加 `**Status:** TRIGGERED — PRE-01 FAIL on <timestamp>`，并填写 fail reason。
    10. 删除或归档 `_spike.ts`：
        - Pass：重命名为 `apps/web/docs/spike-archive/_spike-20260427.ts`（留档但不可访问），或删除。
        - Fail：保留 `_spike.ts` 供 pivot 时参考，但注释说明已废弃。
  </action>
  <verify>
    <automated>test -f apps/web/docs/agent-pivot.md && grep -q "Vercel AI SDK" apps/web/docs/agent-pivot.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - Spike 已运行，Pass/Fail 已判定
    - apps/web/docs/agent-pivot.md 已创建，包含完整映射表和迁移步骤
    - _spike.ts 已处理（归档或删除）
    - _agent-spike.vue 可保留作为后续 pivot 验证的探针，或一并归档
  </done>
  <acceptance_criteria>
    - `test -f apps/web/docs/agent-pivot.md` 为真
    - `grep -q "Vercel AI SDK" apps/web/docs/agent-pivot.md` 为真
    - `grep -q "pi-mono.*streamText.*ai/streamText\|streamText.*ai" apps/web/docs/agent-pivot.md` 为真（映射表包含 streamText 映射）
    - `grep -q "保留不变" apps/web/docs/agent-pivot.md` 为真
    - `grep -q "迁移步骤" apps/web/docs/agent-pivot.md` 为真
    - `grep -q "STATUS.*PASS\|STATUS.*FAIL\|Status.*NOT TRIGGERED\|Status.*TRIGGERED" apps/web/docs/agent-pivot.md` 为真（状态已记录）
    - `_spike.ts` 已不在 `apps/web/server/api/agent/` 下，或已重命名归档（`test ! -f apps/web/server/api/agent/_spike.ts` 或 `test -f apps/web/docs/spike-archive/_spike-20260427.ts`）
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server (SSE) | EventSource 连接从浏览器到 Nitro server，LLM API key 在此边界后 |
| server → LLM provider | pi-ai 通过 HTTPS 调用 Anthropic API，apiKey 在此边界上传输 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Information Disclosure | `NUXT_AGENT_LLM_API_KEY` env var | mitigate | server-only access via `useRuntimeConfig()`；`_spike.ts` 不 log key；响应中不嵌入 key；client 无 `NUXT_PUBLIC_` 前缀变量 |
| T-01-02 | Tampering / Spoofing | SSE data stream from LLM | mitigate | `_agent-spike.vue` 使用 `{{ msg }}` textContent 插值（非 `v-html`），防止 LLM 返回的恶意内容触发 XSS |
| T-01-03 | Denial of Service | SSE connection left open | mitigate | `onmessage` 处理 `done` 事件时调用 `es.close()`；`onerror` 时调用 `es.close()` |
| T-01-04 | Information Disclosure | `_spike.ts` left in production | mitigate | spike 通过后立即删除或归档到 `docs/spike-archive/`（不可通过 `/api/agent/_spike` 访问） |
</threat_model>

<verification>
## 整体验证

1. **依赖验证**：`grep '"@mariozechner/pi-mono": "0.70.2"' apps/web/package.json` 匹配
2. **Server route 验证**：`grep -q "text/event-stream" apps/web/server/api/agent/_spike.ts`
3. **Client 页面验证**：`grep -q "EventSource" apps/web/app/pages/_agent-spike.vue`
4. **API key 安全验证**：`grep "apiKey" apps/web/server/api/agent/_spike.ts | grep -v "agentLlmApiKey" | grep -v "//" | wc -l` = 0
5. **Pivot 文档验证**：`test -f apps/web/docs/agent-pivot.md`
6. **Spike 清理验证**：`test ! -f apps/web/server/api/agent/_spike.ts`（或已归档）
</verification>

<success_criteria>
- [ ] pi-mono 0.70.2 已安装到 apps/web，exact pin，无 caret
- [ ] NUXT_AGENT_LLM_API_KEY 已配置在 apps/web/.env
- [ ] SSE server route 能用 `event.node.res.write` 推送流式 token
- [ ] Client EventSource 能逐 token 接收并渲染到页面
- [ ] Network 面板显示 event-stream 类型，消息间隔 < 100ms
- [ ] 无 CORS / Content-Type / buffering 错误
- [ ] Pivot 文档已写入 apps/web/docs/agent-pivot.md（无论 Pass/Fail）
- [ ] _spike.ts 已清理（删除或归档）
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-flight-schema-foundation/01-001-sse-spike-SUMMARY.md`
</output>
