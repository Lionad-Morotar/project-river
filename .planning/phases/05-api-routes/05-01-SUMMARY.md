---
phase: 05-api-routes
plan: "01"
subsystem: apps/web
tags: [vitest, zod, tdd, api-routes]
dependency_graph:
  requires: [packages/db]
  provides: [05-02, 05-03]
  affects: [apps/web/server/api]
tech-stack:
  added: [zod, vitest, h3]
  patterns: [workspace alias resolution, RED-phase TDD scaffold]
key-files:
  created:
    - apps/web/vitest.config.ts
    - apps/web/server/api/projects/[id]/daily.get.test.ts
    - apps/web/server/api/projects/[id]/monthly.get.test.ts
  modified:
    - apps/web/package.json
decisions:
  - Added h3 as explicit devDependency in apps/web so test scaffolds can construct H3Event objects without relying on transitive resolution.
  - Used dynamic import in tests so the suite compiles while individual tests fail with module-not-found, achieving a clean RED TDD state.
metrics:
  duration_seconds: 128
  completed_date: "2026-04-09"
---

# Phase 05 Plan 01: API Routes Testing Infrastructure & TDD Scaffold Summary

**One-liner:** Installed zod and Vitest in apps/web, configured workspace alias resolution for `@project-river/db`, and created failing RED-phase test scaffolds for both daily and monthly API endpoints.

## Completed Tasks

| # | Task | Commit | Key Output |
|---|------|--------|------------|
| 1 | Install zod and add vitest config for apps/web | `72f411d` | `apps/web/package.json` updated with zod, vitest, h3; `apps/web/vitest.config.ts` created with `@project-river/db` aliases |
| 2 | Create daily endpoint test scaffold | `8ed3545` | `daily.get.test.ts` with 4 tests covering 400, 404, response shape, and date validation |
| 3 | Create monthly endpoint test scaffold | `3d8e4eb` | `monthly.get.test.ts` with 4 tests covering 400, 404, response shape, and limit validation |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added h3 devDependency**
- **Found during:** Task 2
- **Issue:** Test scaffold imports `createEvent` from `h3`, but `h3` was not declared in `apps/web` devDependencies, causing Vitest to fail with "Cannot find package 'h3'" before reaching the intended RED state.
- **Fix:** Added `"h3": "^1.15.0"` to `apps/web/package.json` devDependencies and re-ran `pnpm install`.
- **Files modified:** `apps/web/package.json`
- **Commit:** folded into `8ed3545`

## Known Stubs

None — this plan intentionally does not create the route handlers. The missing `daily.get.ts` and `monthly.get.ts` files are the expected RED-phase targets for Plans 02 and 03.

## Verification Results

- `pnpm --filter @project-river/web exec vitest run server/api` executes both test files without config errors.
- All 8 tests fail because `./daily.get` and `./monthly.get` do not exist yet, confirming the intended RED state.

## Self-Check: PASSED

- [x] `apps/web/vitest.config.ts` exists
- [x] `apps/web/server/api/projects/[id]/daily.get.test.ts` exists
- [x] `apps/web/server/api/projects/[id]/monthly.get.test.ts` exists
- [x] Commits `72f411d`, `8ed3545`, `3d8e4eb` exist in git history
