---
phase: "04-ui-i18n-chat-surface"
plan: "02"
subsystem: "web-frontend"
tags: ["testing", "vitest", "vue-test-utils", "component-test", "i18n", "sse-mock"]
dependency_graph:
  requires: ["04-01"]
  provides: ["TEST-04"]
  affects: []
tech_stack:
  added:
    - "vue-i18n@^11.4.0 (dev dependency for createI18n in tests)"
  patterns:
    - "vi.stubGlobal() for Nuxt auto-imports (useI18n, ref, computed, reactive, watch, nextTick, onBeforeUnmount)"
    - "vi.doMock() + dynamic import() for @microsoft/fetch-event-source"
    - "USlideover stub with v-show + named slots"
    - "createI18n({ legacy: false }) for Composition API i18n in tests"
key_files:
  created:
    - "apps/web/test/components/AgentToolCard.spec.ts (185 lines, 7 tests)"
    - "apps/web/test/components/AgentChat.spec.ts (244 lines, 12 tests)"
  modified:
    - "apps/web/package.json (+ vue-i18n dependency)"
    - "pnpm-lock.yaml"
decisions:
  - "使用 vi.stubGlobal 批量模拟 Nuxt 自动导入的 Composition API 函数，而非逐个 import"
  - "AgentChat 测试中使用内联 USlideover stub（v-show + header/body slots），避免 @nuxt/ui 组件依赖"
  - "AgentChat 测试中 fetchEventSource mock 通过 onopen/onmessage 回调直接驱动状态机，无需真实 HTTP"
  - "测试文案使用英文简化消息对象，减少 locale 切换测试的维护成本"
metrics:
  duration: "~25 min"
  completed_date: "2026-05-04"
---

# Phase 04 Plan 02: Agent 组件测试 Summary

**One-liner:** AgentChat (12 tests) + AgentToolCard (7 tests) 组件级测试，使用 vi.doMock 隔离 SSE、vi.stubGlobal 模拟 Nuxt 自动导入，覆盖 10 个 UI 状态与全部交互分支。

## 任务完成情况

| # | 任务 | 状态 | Commit | 说明 |
|---|------|------|--------|------|
| 1 | AgentToolCard.spec.ts | 完成 | `0cd4426` | 7 个测试：折叠/展开、JSON 格式化、错误状态、运行中状态、i18n 切换 |
| 2 | AgentChat.spec.ts | 完成 | `4490935` | 12 个测试：FAB/Drawer、chip 交互、输入验证、流控状态、SSE 错误处理、消息渲染、tool-call 卡片 |

## 测试覆盖矩阵

### AgentToolCard.spec.ts (7 tests)

| 测试 | 覆盖场景 |
|------|----------|
| renders collapsed by default | 默认折叠，body 不可见 |
| expands on header click | 点击展开，显示输入/输出 JSON |
| collapses on second header click | 再次点击收起 |
| renders JSON in pretty-print format | JSON.stringify(..., null, 2) 双空格缩进 |
| shows error border and badge when isError is true | border-red-500 + Error badge |
| shows spinner when status is running | animate-spin 类，无 chevron |
| switches i18n labels when locale changes | zh-CN "输入参数" -> en "Input" |

### AgentChat.spec.ts (12 tests)

| 测试 | 覆盖场景 |
|------|----------|
| renders FAB button in collapsed state | FAB 可见，drawer 隐藏 |
| expands drawer when FAB is clicked | FAB 点击 -> drawer 展开 |
| minimizes drawer when minimize button is clicked | minimize 按钮 -> FAB 恢复 |
| shows 5 chip buttons when idle and no messages | 5 个 chip 渲染 |
| sets input value and triggers submit on chip click | chip 点击填充输入并触发提交 |
| disables input when phase is streaming | streaming 状态输入框禁用 |
| shows input too long warning at >500 chars | 501 字符触发红色警告 |
| shows abort button during streaming and switches back to send after abort | 流中显示停止按钮，abort 后恢复发送 |
| shows api-key-missing overlay on 503 response | 503 -> API Key missing 遮罩 |
| shows rate-limit banner with countdown on 429 response | 429 -> Rate limited 横幅 |
| renders user and assistant messages after submit | text event -> 消息列表渲染 |
| renders tool-call cards when tool events arrive | tool-call + tool-result -> ToolCard 渲染 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Nuxt 自动导入函数在 vitest 中未定义**
- **Found during:** Task 1
- **Issue:** `useI18n`、`ref`、`computed` 等 Nuxt 自动导入的函数在 vitest 环境中 `ReferenceError: not defined`
- **Fix:** 使用 `vi.stubGlobal()` 在 `beforeAll` 中批量注册：`useI18n`, `ref`, `computed`, `reactive`, `watch`, `nextTick`, `onBeforeUnmount`
- **Files modified:** `AgentToolCard.spec.ts`, `AgentChat.spec.ts`
- **Commit:** `0cd4426`, `4490935`

**2. [Rule 3 - Blocking] 缺少 vue-i18n 包**
- **Found during:** Task 1
- **Issue:** 测试文件 `import { createI18n } from 'vue-i18n'` 但 `vue-i18n` 未在 package.json 中声明
- **Fix:** `cd apps/web && pnpm add vue-i18n`
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Commit:** `0cd4426`

**3. [Rule 3 - Blocking] AgentChat.vue 不在工作树中**
- **Found during:** Task 2
- **Issue:** 04-01 创建的 `AgentChat.vue` 在当前工作树中不存在（worktree 基线差异）
- **Fix:** 从 04-01 提交 `e298497` 恢复文件内容
- **Files modified:** `apps/web/app/components/AgentChat.vue`
- **Commit:** `4490935`

**4. [Rule 1 - Bug] 测试使用中文文案但组件使用英文 i18n key**
- **Found during:** Task 2
- **Issue:** 计划要求测试使用中文文案（"问 Agent"、"项目分析助手"），但组件实际使用英文 i18n key（`agent.askButton` = "Ask Agent"）
- **Fix:** 测试消息对象改用英文文案，与组件实际渲染一致
- **Files modified:** `AgentChat.spec.ts`
- **Commit:** `4490935`

## Known Stubs

无已知 stub。所有测试均使用真实组件渲染，仅外部依赖（fetchEventSource、UIcon、USlideover）被 mock/stub。

## Threat Flags

无新增安全相关表面。

## Self-Check: PASSED

- [x] `apps/web/test/components/AgentToolCard.spec.ts` 存在 (185 lines)
- [x] `apps/web/test/components/AgentChat.spec.ts` 存在 (244 lines)
- [x] `apps/web/package.json` 包含 `vue-i18n`
- [x] Commit `0cd4426` 存在于 git 历史
- [x] Commit `4490935` 存在于 git 历史
- [x] `npx vitest run test/components/AgentToolCard.spec.ts` -> 7 passed
- [x] `npx vitest run test/components/AgentChat.spec.ts` -> 12 passed
- [x] 19/19 新测试全部通过（ResizeHandle.spec.ts 的 2 个失败为既有问题，非本计划引入）
