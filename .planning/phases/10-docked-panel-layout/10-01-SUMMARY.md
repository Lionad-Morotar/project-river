---
phase: "10"
plan: "01"
subsystem: web
 tags:
  - layout
  - drag-and-drop
  - dark-theme
  - testing
requires: []
provides: []
affects:
  - apps/web/app/pages/projects/[id]/index.vue
  - apps/web/app/components/MonthDetailPanel.vue
  - apps/web/app/components/Streamgraph.vue
tech-stack:
  added:
    - "@atlaskit/pragmatic-drag-and-drop"
    - "@vue/test-utils"
    - "playwright"
  patterns:
    - CSS Grid for docked layouts
    - useStorage for localStorage persistence
    - useThrottleFn for debounced D3 redraws
key-files:
  created:
    - apps/web/app/components/ProjectLayout.vue
    - apps/web/app/components/DraggablePanel.vue
    - apps/web/app/components/ResizeHandle.vue
    - apps/web/app/composables/usePanelDrag.ts
    - apps/web/test/components/ResizeHandle.spec.ts
    - apps/web/test/composables/usePanelDrag.spec.ts
    - apps/web/e2e/docked-panel.spec.ts
    - apps/web/playwright.config.ts
  modified:
    - apps/web/app/pages/projects/[id]/index.vue
    - apps/web/app/components/MonthDetailPanel.vue
    - apps/web/app/components/Streamgraph.vue
    - apps/web/app/components/StreamgraphTooltip.vue
    - apps/web/app/app.vue
    - apps/web/vitest.config.ts
    - apps/web/package.json
decisions:
  - "Use @atlaskit/pragmatic-drag-and-drop instead of Kareem-based hook"
  - "Split MonthDetailPanel into pure presentation + DraggablePanel wrapper"
  - "Extract ProjectLayout.vue to own grid, drop handles, and resize logic"
  - "Debounce D3 redraws during resize via useThrottleFn (~150ms)"
  - "Throttle localStorage writes: update local ref during drag, flush on mouseup"
  - "Minimum sizes: chart >=300px, panel >=200px (vertical) / >=160px (horizontal)"
  - "Clamp floating coordinates to viewport bounds on drag end"
  - "Persist docked edge + resize ratios + floating position in localStorage via useStorage"
metrics:
  duration: "~45m"
  completed_date: "2026-04-16"
  tasks: 6
  files: 15
---

# Phase 10 Plan 01: Docked Panel Layout Summary

**One-liner:** 重构 `/projects/[id]` 页面布局，使 `MonthDetailPanel` 支持从浮动状态拖拽停靠到上/左/右/下四边，并可通过 resize handle 调整面板与图表的比例，状态持久化到 localStorage，同时完成深色主题迁移。

## What Was Built

- **ProjectLayout.vue**: 页面级布局容器，负责四种 docked 状态（top/left/right/bottom）的 CSS Grid 切换、四边 drop target、resize handle 嵌入以及尺寸约束。
- **DraggablePanel.vue**: 浮动态包装器，基于 `@vueuse/core` 的 `useDraggable` 实现拖拽，并在 drag end 时钳制坐标到 viewport 边界。
- **ResizeHandle.vue**: 可复用的 resize 手柄，支持 `horizontal` / `vertical` 两种方向，支持键盘方向键微调。
- **usePanelDrag.ts**: 直接调用 `@atlaskit/pragmatic-drag-and-drop` 的轻量 composable，管理拖拽状态与 drop edge 反馈。
- **深色主题迁移**: `app.vue`、`[id]/index.vue`、`MonthDetailPanel.vue`、`Streamgraph.vue`、`StreamgraphTooltip.vue` 全部切换为 `slate-950/900/800` 深色 token，移除硬编码浅色值。
- **测试基础设施**: 配置 `@vitejs/plugin-vue` 与 `jsdom` 环境支持 Vue SFC 单元测试；新增 `ResizeHandle` 和 `usePanelDrag` 单元测试；新增 Playwright E2E 测试与配置文件。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest 无法解析 `~` 别名与 Vue SFC**
- **Found during:** 测试任务
- **Issue:** 新测试文件导入 `~/components/ResizeHandle.vue` 和 `~/composables/usePanelDrag` 时解析失败，且 `.vue` 文件在 vitest 中无法被解析。
- **Fix:** 在 `apps/web/vitest.config.ts` 中补充 `~` 和 `~/components` 等显式别名，并添加 `@vitejs/plugin-vue` 插件，将 `environment` 改为 `jsdom`。
- **Files modified:** `apps/web/vitest.config.ts`
- **Commit:** `887e66d`

**2. [Rule 1 - Bug] ResizeHandle pointer capture 在 jsdom 中不存在导致测试失败**
- **Found during:** 测试任务
- **Issue:** `setPointerCapture` / `releasePointerCapture` 在 jsdom 环境下未实现，抛出异常导致测试失败。
- **Fix:** 在调用前添加 `if (target.setPointerCapture)` 和 `if (target.releasePointerCapture)` 守卫。
- **Files modified:** `apps/web/app/components/ResizeHandle.vue`
- **Commit:** `887e66d`

**3. [Rule 3 - Blocking] Playwright 测试被 vitest 误扫描**
- **Found during:** 测试任务
- **Issue:** E2E 测试文件放在 `test/e2e/` 下被 vitest 扫描，导致 `@playwright/test` 解析失败。
- **Fix:** 将 Playwright 测试移至 `apps/web/e2e/`，更新 `playwright.config.ts` 的 `testDir`，并在 `vitest.config.ts` 中显式设置 `include` 为 `test/**/*.spec.ts` 和 `app/**/*.test.ts`。
- **Files modified:** `apps/web/playwright.config.ts`, `apps/web/vitest.config.ts`
- **Commit:** `a2d4c9d`

## Auth Gates

None.

## Known Stubs

None — 所有新增组件均已接入实际数据流，localStorage 持久化逻辑完整实现。

## Threat Flags

None — 未引入新的网络端点或文件访问模式；localStorage 仅用于客户端 UI 状态，无敏感数据。

## Self-Check: PASSED

- [x] `apps/web/app/components/ProjectLayout.vue` exists
- [x] `apps/web/app/components/DraggablePanel.vue` exists
- [x] `apps/web/app/components/ResizeHandle.vue` exists
- [x] `apps/web/app/composables/usePanelDrag.ts` exists
- [x] `apps/web/test/components/ResizeHandle.spec.ts` exists
- [x] `apps/web/test/composables/usePanelDrag.spec.ts` exists
- [x] `apps/web/e2e/docked-panel.spec.ts` exists
- [x] Vitest workspace passes (`npx vitest run` → 29 passed, 11 skipped)
- [x] All commits verified via `git log`
