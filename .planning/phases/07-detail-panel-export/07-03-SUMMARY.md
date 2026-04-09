---
phase: 07-detail-panel-export
plan: 03
type: execute
subsystem: web
status: complete
tags:
  - ui
  - export
  - integration
dependency_graph:
  requires:
    - 07-01
    - 07-02
  provides:
    - UI-04
    - EXPORT-01
tech_stack:
  added: []
  patterns:
    - Vue 3 v-model prop sync with kebab-case naming
    - Template ref with duck-typed exposed method
key_files:
  created: []
  modified:
    - apps/web/app/pages/projects/[id]/index.vue
    - apps/web/test/setup.ts
decisions:
  - Typed streamgraphRef as { getSvg: () => SVGSVGElement | null } | null to avoid explicit .vue type import issues
metrics:
  duration: 10m
  completed_date: "2026-04-09"
  tasks: 2
  files: 2
---

# Phase 07 Plan 03: Wire Detail Panel and Export Summary

## One-Liner
Wired MonthDetailPanel, bidirectional month selection, auto-selection on load, and SVG export into the project page, completing UI-04 and EXPORT-01 end-to-end.

## What Changed

### `apps/web/app/pages/projects/[id]/index.vue`
- Added imports for `MonthDetailPanel`, `monthDetailHelpers`, `svgExport`, and `useContributorColors`.
- Introduced `streamgraphRef` to access the rendered SVG node via Streamgraph's exposed `getSvg()` method.
- Added computed state for the detail panel: `colorMap`, `hasData`, `panelContributors`, `commitsThisMonth`, `totalCommitsToDate`.
- Implemented auto-selection of the latest month after fetching daily/monthly data.
- Added `handleExport` to trigger `downloadStreamgraphSvg` with the live SVG node and sorted contributor list.
- Rendered `<MonthDetailPanel>` inside the data-available block with full prop bindings and `v-model:selected-month`.
- Bound `ref="streamgraphRef"` on `<Streamgraph>` to enable SVG export.

### `apps/web/test/setup.ts`
- Fixed lint errors discovered during verification:
  - Explicit `node:process` import.
  - Replaced top-level await with promise-based dynamic import.
  - Sorted imports per project lint rules.

## Deviations from Plan

### Auto-fixed Issues
**1. [Rule 3 - Blocking] Lint failures in `test/setup.ts` during Task 2 verification**
- **Found during:** Task 2 (build/lint/test verification)
- **Issue:** `test/setup.ts` had `node/prefer-global/process` and `antfu/no-top-level-await` violations that caused `pnpm lint` to fail.
- **Fix:** Imported `process` explicitly and rewrote the top-level `await import('dotenv')` as a synchronous helper that chains `.then/.catch`.
- **Files modified:** `apps/web/test/setup.ts`
- **Commit:** `30c8b5e`

## Known Stubs
None — all props are wired to live computed state and the export handler uses the actual SVG node.

## Verification Results
- `vitest run` (utils + composables): 18 tests passed.
- `pnpm --filter @project-river/web lint`: clean (0 errors, 0 warnings).
- `pnpm --filter @project-river/web build`: successful, no type or compilation errors.

## Self-Check: PASSED
- `index.vue` exists and contains integrated panel and export wiring.
- Commit `c58d288` exists.
- Commit `30c8b5e` exists.
