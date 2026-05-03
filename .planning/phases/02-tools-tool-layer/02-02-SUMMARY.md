---
phase: 02-tools-tool-layer
plan: 02
subsystem: api
tags: [zod, drizzle-orm, agent-tools, vitest, vi.doMock]

# Dependency graph
requires:
  - phase: 02-01
    provides: detectProjectEvents 纯函数库 + DailyRow/ProjectEvent 类型
  - phase: 01-pre-flight-schema-foundation
    provides: commit_files schema 已验证
provides:
  - 3 个 zod-typed agent tools（queryContributors, queryProjectEvents, queryCommitsByPath）
  - barrel index.ts 导出全部 schemas + 函数
  - 30 个 tool 单元测试（vi.doMock 隔离 DB）
  - vitest ~/server alias 配置
affects: [phase-03-agent-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod-typed-tools, vi.doMock-DB-mock, sql-template-tag-aggregation]

key-files:
  created:
    - apps/web/server/agent/tools/queryContributors.ts
    - apps/web/server/agent/tools/queryProjectEvents.ts
    - apps/web/server/agent/tools/queryCommitsByPath.ts
    - apps/web/server/agent/tools/index.ts
    - apps/web/test/server/agent/tools/queryContributors.spec.ts
    - apps/web/test/server/agent/tools/queryProjectEvents.spec.ts
    - apps/web/test/server/agent/tools/queryCommitsByPath.spec.ts
  modified:
    - apps/web/vitest.config.ts

key-decisions:
  - "vitest alias 使用数组格式确保 ~/server 优先于 ~/ 匹配"
  - "queryContributors 使用 sql template tag 聚合 + JS 侧排序/过滤，避免复杂 Drizzle query builder"
  - "queryCommitsByPath 使用 STRING_AGG 聚合多文件路径，避免 N+1 查询"
  - "test 文件使用 .spec.ts 后缀放在 test/ 目录下（匹配 vitest include 规则 test/**/*.spec.ts）"

patterns-established:
  - "agent tool 统一签名: (projectId: number, params: z.infer<typeof XxxSchema>) => Promise<T>"
  - "vi.doMock + 动态 import 的 DB mock 模式"
  - "sql template tag 用于复杂聚合查询（Drizzle query builder 不便表达时）"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TEST-01]

# Metrics
duration: 10min
completed: 2026-05-03
---

# Phase 02 Plan 02: TOOL-01/02/03 — 3 个 zod-typed tools + 测试 Summary

**3 个 agent tools 实现：queryContributors（贡献者排序+modules 提取）、queryProjectEvents（事件检测+过滤）、queryCommitsByPath（路径前缀+message 截断），配套 30 个单元测试全部 pass**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-03T04:38:15Z
- **Completed:** 2026-05-03T04:48:39Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- 3 个 zod-typed tools 完整实现，统一函数签名，复用 assertProjectExists
- 30 个单元测试覆盖 happy path + 空结果 + 截断/越界边界 + schema 校验
- vitest.config.ts 添加 ~/server alias，解决 server/ 目录路径解析

## Task Commits

Each task was committed atomically:

1. **Task 1: 实现 3 个 zod-typed tools + barrel index** - `2e85983` (feat)
2. **Task 2: 三个 tool 的单元测试 + vitest alias 配置** - `8925e7a` (test)

## Files Created/Modified
- `apps/web/server/agent/tools/queryContributors.ts` (152 行) — 贡献者排序查询，支持 commits/recency/span 排序 + top 5 modules 路径段提取
- `apps/web/server/agent/tools/queryProjectEvents.ts` (120 行) — 项目事件查询，包装 detectEvents + typeFilter/dateRange 过滤
- `apps/web/server/agent/tools/queryCommitsByPath.ts` (89 行) — 路径前缀 commit 查询，prefix-only LIKE + STRING_AGG + message 截断 200 字符
- `apps/web/server/agent/tools/index.ts` (3 行) — Barrel export
- `apps/web/test/server/agent/tools/queryContributors.spec.ts` (190 行) — 11 个测试
- `apps/web/test/server/agent/tools/queryProjectEvents.spec.ts` (131 行) — 7 个测试
- `apps/web/test/server/agent/tools/queryCommitsByPath.spec.ts` (165 行) — 12 个测试
- `apps/web/vitest.config.ts` — 添加 ~/server alias（数组格式）

## Decisions Made
- vitest alias 使用数组格式（`{ find, replacement }[]`），确保 `~/server` 排在 `~/` 前面避免贪婪匹配
- queryContributors 使用 3 次独立 SQL 查询（聚合 + email + modules），而非单次复杂 JOIN，保持查询可读性
- test 文件使用 `.spec.ts` 后缀放在 `test/` 目录下，匹配 vitest include 规则 `test/**/*.spec.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest ~/server alias 配置**
- **Found during:** Task 2（测试运行时 `~/server/agent/tools/xxx` import 解析失败）
- **Issue:** vitest 配置中 `~` 只解析到 `app/` 目录，`server/` 目录下的文件无法通过 `~/server/` 导入
- **Fix:** 在 vitest.config.ts 添加 `~/server` alias 指向 `./server`，使用数组格式确保长前缀优先匹配
- **Files modified:** apps/web/vitest.config.ts
- **Committed in:** `8925e7a` (Task 2 commit)

**2. [Rule 3 - Blocking] test 文件后缀从 .test.ts 改为 .spec.ts**
- **Found during:** Task 2（计划要求 `.test.ts` 后缀，但 vitest include 规则 `test/**/*.spec.ts` 不覆盖 `test/` 下的 `.test.ts` 文件）
- **Issue:** `.test.ts` 后缀只匹配 `app/**/*.test.ts` 规则，`test/` 目录下必须使用 `.spec.ts`
- **Fix:** 测试文件使用 `.spec.ts` 后缀

---

**Total deviations:** 2 auto-fixed (2 blocking — vitest 配置和测试文件命名)
**Impact on plan:** 两个修复都是必要的构建配置问题，无范围扩展

## Issues Encountered
- None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 3 个 tools 可通过 `import { queryContributors, queryProjectEvents, queryCommitsByPath } from '~/server/agent/tools'` 在 agent route 中使用
- Phase 3 的 agent engine 可直接调用 tools，schema 用于 LLM tool definition 生成
- vi.doMock 模式已建立，Phase 3 的 agent route 测试可复用

---
*Phase: 02-tools-tool-layer*
*Completed: 2026-05-03*
