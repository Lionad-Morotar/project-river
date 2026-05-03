---
phase: 02-tools-tool-layer
plan: 01
subsystem: infra
tags: [pure-function, web-worker, event-detection, vitest]

# Dependency graph
requires:
  - phase: 01-pre-flight-schema-foundation
    provides: commit_files schema 已验证存在
provides:
  - detectProjectEvents 纯函数库（server/utils/detectProjectEvents.ts）
  - 9 个 exported 函数 + 6 个 exported 类型 + 1 个 exported 常量
  - 21 个纯函数单元测试
  - 精简后的 worker（35 行 message handling 壳）
affects: [02-02, phase-03-agent-engine, phase-04-chat-drawer]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function-extraction, shared-server-worker-module]

key-files:
  created:
    - apps/web/server/utils/detectProjectEvents.ts
    - apps/web/test/utils/detectProjectEvents.spec.ts
  modified:
    - apps/web/app/workers/projectEvents.worker.ts

key-decisions:
  - "DayStat 接口保持 internal（不 export），仅通过 buildDayStats 返回值消费"
  - "worker 使用 ~/server/utils/detectProjectEvents import 路径，Nuxt auto-import 自动解析"
  - "activity_drop 测试使用自定义 activityDropConsecutiveDays: 5 以适配滑动窗口的 std 收敛特性"

patterns-established:
  - "server/utils 作为 server-side 和 client-side worker 共享纯函数的桥梁"
  - "worker 精简为 message handling 壳 + import 纯函数的模式"

requirements-completed: [INFRA-04]

# Metrics
duration: 6min
completed: 2026-05-03
---

# Phase 02 Plan 01: INFRA-04 detectProjectEvents 纯函数抽取 Summary

**从 worker 抽取 9 个纯函数 + 6 个类型到 server/utils，server-side tools 可直接 import，worker 精简为 35 行 shell**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-03T04:32:18Z
- **Completed:** 2026-05-03T04:38:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- detectProjectEvents 纯函数库（452 行）从 worker 完整抽取到 server/utils
- Worker 精简到 35 行 message handling 壳，行为完全不变
- 21 个纯函数单元测试覆盖全部 7 类事件检测 + 辅助函数 + 边界情况

## Task Commits

Each task was committed atomically:

1. **Task 1: 抽取 detectProjectEvents 纯函数到 server/utils** - `1e6fc79` (feat)
2. **Task 2: detectProjectEvents 纯函数单元测试** - `1227a38` (test)

## Files Created/Modified
- `apps/web/server/utils/detectProjectEvents.ts` - 纯函数库：9 个 exported 函数（detectEvents, buildDayStats, computeSlidingWindow, daysBetween, detectContributorEvents, detectActivityMutations, detectRefactors, detectMilestones, detectProjectArchived）+ 6 个 exported 类型 + defaultConfig 常量
- `apps/web/app/workers/projectEvents.worker.ts` - 精简为 message handling 壳，从新位置 import detectEvents
- `apps/web/test/utils/detectProjectEvents.spec.ts` - 21 个纯函数单元测试

## Decisions Made
- DayStat 接口保持 internal（不 export），仅通过 buildDayStats 返回值消费，减少公共 API 面
- Worker 使用 `~/server/utils/detectProjectEvents` import 路径，Nuxt 的路径别名在 vitest 中通过 vitest.config.ts 解析
- activity_drop 测试使用自定义 `activityDropConsecutiveDays: 5`，因为默认 30 天滑动窗口 + z-score < -2.0 条件下，0 commit 天的 z-score 会随着窗口中 0 值增多而收敛，导致连续 7 天达标困难

## Deviations from Plan

None - plan executed exactly as specified.

## Issues Encountered
- ESLint antfu 风格要求 union type 的 `=` 放在行首（`type X\n  = | 'a'` 而非 `type X =\n  | 'a'`），通过 `eslint --fix` 自动修复

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 可直接 `import { detectEvents, type DailyRow, type ProjectEvent } from '~/server/utils/detectProjectEvents'`
- queryProjectEvents tool 将包装 detectEvents + DB 查询 + typeFilter/dateRange 过滤
- Worker 行为不变，composable useProjectEvents 无需修改

---
*Phase: 02-tools-tool-layer*
*Completed: 2026-05-03*
