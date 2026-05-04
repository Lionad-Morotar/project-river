---
phase: 04-ui-i18n-chat-surface
plan: 01
subsystem: ui
tags: [vue, nuxt-ui, sse, i18n, fetch-event-source, agent-chat]

requires:
  - phase: 03-agent-engine-and-route
    provides: SSE route /api/projects/[id]/agent with event types text/tool-call/tool-result/done/error

provides:
  - AgentChat.vue FAB + USlideover drawer with 10-state state machine
  - AgentToolCard.vue collapsible tool-call cards with JSON pretty-print
  - 12 i18n keys (agent.* namespace) in zh-CN and en
  - @microsoft/fetch-event-source dependency for POST-based SSE
  - AgentChat mounted on project detail page

affects:
  - 04-02-test-coverage
  - 05-eval-e2e

tech-stack:
  added:
    - "@microsoft/fetch-event-source@2.0.1"
  patterns:
    - "FAB tri-state displayMode (fab/drawer) with session state survival"
    - "AgentPhase state machine driven by SSE events"
    - "Tool-call cards with v-show toggle + JSON.stringify pretty-print"

key-files:
  created:
    - apps/web/app/components/AgentChat.vue
    - apps/web/app/components/AgentToolCard.vue
  modified:
    - apps/web/package.json
    - apps/web/i18n/locales/zh-CN.ts
    - apps/web/i18n/locales/en.ts
    - apps/web/app/pages/projects/[id]/index.vue

key-decisions:
  - "FAB 常驻右下固定定位，drawer 打开时 FAB 仍渲染（v-show），session state 不丢失"
  - "USlideover dismissible=false，Esc/overlay 点击被拦截为 minimize（回到 FAB）"
  - "input-too-long 用 computed + watch 联动，长度降至 500 以内自动恢复 idle"
  - "rate-limit 倒计时用 setInterval，到 0 自动转 idle"
  - "cost-cap 前端估算：每个 SSE text event 计 1 token，50K 上限"

patterns-established:
  - "AgentChat 作为自治根组件，不依赖 ProjectLayout，挂载于页面模板尾部"
  - "所有用户可见文案走 i18n t('agent.*')，支持 locale 切换即时同步"
  - "Error 分层：HTTP status（onopen）vs SSE error event（onmessage）vs 网络中断（onerror）"

requirements-completed: [UI-05, UI-06, UI-07, UI-08, I18N-01]

duration: 5min
completed: 2026-05-04
---

# Phase 4 Plan 1: AgentChat UI + i18n + 页面挂载

**AgentChat.vue with FAB tri-state drawer, 10-phase state machine consuming SSE events, 12 bilingual i18n keys, and AgentToolCard collapsible JSON cards**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-04T03:43:23Z
- **Completed:** 2026-05-04T03:48:41Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- AgentChat.vue: 402-line component with FAB, USlideover, 10-state machine, SSE consumption, chip questions, message list, error overlays
- AgentToolCard.vue: 96-line collapsible tool-call card with JSON pretty-print, duration, error badge
- 12 i18n keys added to both zh-CN.ts and en.ts under agent.* namespace
- @microsoft/fetch-event-source 2.0.1 installed for POST-based SSE with AbortController
- AgentChat mounted on project detail page with :project-id prop
- TypeScript compilation passes (EXIT:0)
- ESLint passes with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: 安装依赖 + i18n 12 key + AgentToolCard.vue** - `d2bf6b7` (feat)
2. **Task 2: AgentChat.vue 主组件** - `82e7753` (feat)
3. **Task 3: 页面挂载 + 类型修复** - `e298497` (feat)

## Files Created/Modified
- `apps/web/package.json` - Added @microsoft/fetch-event-source 2.0.1 dependency
- `apps/web/i18n/locales/zh-CN.ts` - Added agent.* namespace with 12 Chinese keys
- `apps/web/i18n/locales/en.ts` - Added agent.* namespace with 12 English keys
- `apps/web/app/components/AgentToolCard.vue` - Collapsible tool-call card (created)
- `apps/web/app/components/AgentChat.vue` - Main chat component with FAB + drawer + state machine (created)
- `apps/web/app/pages/projects/[id]/index.vue` - Mounted AgentChat at template tail

## Decisions Made
- Followed plan exactly for FAB tri-state design (displayMode: 'fab' | 'drawer')
- USlideover dismissible=false to intercept close as minimize
- Session state (messages, toolCalls, abortController) survives fab/drawer transitions
- Chip questions locked to VueUse corpus (EVAL-02/03 aligned)
- All user-facing text routed through i18n t('agent.*')

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint max-statements-per-line on minimize/expand functions**
- **Found during:** Task 3 (ESLint verification)
- **Issue:** `function minimize() { displayMode.value = 'fab' }` violates style/max-statements-per-line
- **Fix:** Split to multi-line function bodies
- **Files modified:** apps/web/app/components/AgentChat.vue
- **Verification:** ESLint passes
- **Committed in:** e298497

**2. [Rule 1 - Bug] ESLint no-use-before-define on inputRef**
- **Found during:** Task 3 (ESLint verification)
- **Issue:** `inputRef` used in watch() before its declaration
- **Fix:** Moved `const inputRef = ref(...)` before the watch() that references it
- **Files modified:** apps/web/app/components/AgentChat.vue
- **Verification:** ESLint passes
- **Committed in:** e298497

**3. [Rule 3 - Blocking] Worktree file system isolation caused file writes to wrong path**
- **Found during:** Task 1 (file creation)
- **Issue:** Write tool wrote files to main repo path instead of worktree path; git add failed because files were not in worktree working directory
- **Fix:** Copied files from main repo to worktree path, then staged and committed
- **Files modified:** apps/web/i18n/locales/zh-CN.ts, apps/web/i18n/locales/en.ts, apps/web/app/components/AgentToolCard.vue
- **Verification:** git status showed files as modified/added; commit succeeded
- **Committed in:** d2bf6b7

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking)
**Impact on plan:** All fixes necessary for correctness and build compliance. No scope creep.

## Issues Encountered
- pnpm add with --filter flag did not persist to package.json; needed to run from apps/web directory directly
- Worktree .git is a file pointing to main repo's worktree directory; all git operations must be from worktree cwd
- ESLint vue/singleline-html-element-content-newline warnings auto-fixed with --fix

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AgentChat UI surface complete, ready for component tests (04-02)
- All 10 UI states implemented and visually wired
- i18n keys ready for test locale switching validation
- SSE client ready for integration with live agent route

## Self-Check: PASSED

- [x] `apps/web/app/components/AgentChat.vue` exists (402 lines)
- [x] `apps/web/app/components/AgentToolCard.vue` exists (96 lines)
- [x] `apps/web/i18n/locales/zh-CN.ts` contains agent.* namespace
- [x] `apps/web/i18n/locales/en.ts` contains agent.* namespace
- [x] `apps/web/package.json` contains @microsoft/fetch-event-source 2.0.1
- [x] `apps/web/app/pages/projects/[id]/index.vue` contains `<AgentChat`
- [x] Commit d2bf6b7 exists
- [x] Commit 82e7753 exists
- [x] Commit e298497 exists
- [x] TypeScript compiles (EXIT:0)
- [x] ESLint passes (0 errors)

---
*Phase: 04-ui-i18n-chat-surface*
*Plan: 01*
*Completed: 2026-05-04*
