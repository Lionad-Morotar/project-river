---
phase: 04-pipeline-cli-sumday
plan: 01
subsystem: pipeline
tags: [postgres, sql, window-functions, drizzle, vitest]
dependency_graph:
  requires: [daily_stats schema, db client]
  provides: [generateSumDay, sum_day rows]
  affects: [packages/pipeline]
tech_stack:
  added: []
  patterns:
    - PostgreSQL CTE with SUM(...) OVER (PARTITION BY contributor ORDER BY date)
    - Drizzle db.execute(sql\`...\`) for complex SQL
    - per-test cleanup via afterEach for isolation
key-files:
  created:
    - packages/pipeline/src/db/sumDay.ts
    - packages/pipeline/vitest.config.ts
  modified:
    - packages/pipeline/src/index.ts
    - packages/pipeline/tests/sumDay.test.ts
    - packages/pipeline/package.json
    - pnpm-lock.yaml
decisions:
  - Split DELETE and INSERT/CTE into two db.execute calls because node-postgres prepared statements reject multi-command strings.
  - Added vitest.config.ts with absolute path aliases to resolve @project-river/db/* in pipeline tests without workspace linking issues.
metrics:
  duration: 9m
  completed_date: "2026-04-09T03:08:33Z"
  tasks: 2
  files: 6
---

# Phase 04 Plan 01: sumDay SQL generator with window functions — Summary

**One-liner:** Implemented `generateSumDay(projectId)` using a PostgreSQL CTE and `SUM(...) OVER (PARTITION BY contributor ORDER BY date)` to compute rolling cumulative commits/insertions/deletions per contributor, verified with Drizzle-backed integration tests.

## What Was Built

- `packages/pipeline/src/db/sumDay.ts`
  - Exports `generateSumDay(projectId: number): Promise<void>`.
  - Performs a targeted `DELETE FROM sum_day` for the project.
  - Runs a CTE query that reads `daily_stats` and uses window functions to calculate cumulative values.
  - Inserts the results into `sum_day`.

- `packages/pipeline/tests/sumDay.test.ts`
  - Integration tests with `beforeAll` project creation and `afterEach`/`afterAll` cleanup.
  - Gracefully skips when `DATABASE_URL` is unavailable.
  - Case 1: single contributor cumulative correctness.
  - Case 2: multi-contributor isolation (independent cumulative sequences).

- `packages/pipeline/vitest.config.ts`
  - Adds absolute path aliases for `@project-river/db/client` and `@project-river/db/schema` so tests resolve the workspace db package.

## Verification

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/river pnpm --filter @project-river/pipeline test -- --reporter=verbose`
  - All 11 tests pass (3 existing parser/calcDay + 2 new sumDay).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Multi-command SQL rejected by node-postgres prepared statement**
- **Found during:** Task 2 implementation / GREEN step
- **Issue:** `db.execute(sql\`DELETE ...; WITH ... INSERT ...\`)` failed with "cannot insert multiple commands into a prepared statement"
- **Fix:** Split into two sequential `db.execute()` calls — one for DELETE, one for the CTE INSERT.
- **Files modified:** `packages/pipeline/src/db/sumDay.ts`
- **Commit:** 4bb1a2e

**2. [Rule 3 - Blocking] Missing @project-river/db workspace resolution in pipeline tests**
- **Found during:** Task 2 / running tests
- **Issue:** `pnpm --filter @project-river/pipeline test` could not resolve `@project-river/db/client` because pnpm workspace links were not present for internal packages.
- **Fix:** Added `packages/pipeline/vitest.config.ts` with absolute path aliases to `../db/src/client.ts` and `../db/src/schema/index.ts`.
- **Files created:** `packages/pipeline/vitest.config.ts`
- **Commit:** 4bb1a2e

**3. [Rule 3 - Blocking] Daily_stats table missing `files_touched` column before testing**
- **Found during:** Task 2 / GREEN step
- **Issue:** A prior schema migration was not yet applied to the local PostgreSQL instance, so inserting test rows failed with "column files_touched of relation daily_stats does not exist".
- **Fix:** Ran `DATABASE_URL=... pnpm --filter @project-river/db db:migrate` to apply pending migrations.
- **No file changes** (environment state fix)

**4. [Rule 2 - Missing Critical] Test isolation between cases**
- **Found during:** Task 2 / test assertions
- **Issue:** The multi-contributor test saw 4 rows instead of 2 because daily_stats and sum_day from the first test were not cleaned up.
- **Fix:** Added `afterEach` hook to delete `sum_day` and `daily_stats` for the test project after every test case.
- **Files modified:** `packages/pipeline/tests/sumDay.test.ts`
- **Commit:** 4bb1a2e

**5. [Rule 3 - Blocking] Missing `drizzle-orm` and `pg` dependencies in pipeline package**
- **Found during:** Task 2 / first test run
- **Issue:** `packages/pipeline/package.json` did not declare `drizzle-orm` or `pg` as dependencies, so the test runner could not import `drizzle-orm`.
- **Fix:** Added `drizzle-orm` and `pg` to `packages/pipeline/package.json` dependencies and ran `pnpm install`.
- **Files modified:** `packages/pipeline/package.json`, `pnpm-lock.yaml`
- **Commit:** 4bb1a2e

## Known Stubs

None — `generateSumDay` is fully wired to PostgreSQL and integration tests confirm end-to-end behavior.

## Self-Check: PASSED

- [x] `packages/pipeline/src/db/sumDay.ts` exists and exports `generateSumDay`
- [x] `packages/pipeline/tests/sumDay.test.ts` exists with 2 passing `it()` blocks
- [x] Commit `36a2dd9` verified via `git log --oneline`
- [x] Commit `4bb1a2e` verified via `git log --oneline`
