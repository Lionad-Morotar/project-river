---
phase: 05-api-routes
plan: "02"
subsystem: api
tags: [nuxt, nitro, zod, h3, vitest, postgresql, drizzle-orm]
dependency_graph:
  requires:
    - phase: 05-01
      provides: vitest setup, scaffold tests, workspace alias resolution
  provides:
    - GET /api/projects/:id/daily endpoint
    - zero-filled daily contributor statistics with cumulativeCommits
    - validated query parameters (start, end, limit, offset)
    - error handling (400, 404)
  affects:
    - 05-03
    - 06-streamgraph
tech-stack:
  added:
    - drizzle-orm (apps/web devDependencies)
    - pg (apps/web devDependencies)
  patterns:
    - explicit h3 imports in Nitro route handlers for testability
    - CTE with generate_series for zero-filled time-series grids
    - static handler imports in route tests
key-files:
  created:
    - apps/web/server/api/projects/[id]/daily.get.ts
  modified:
    - apps/web/server/api/projects/[id]/daily.get.test.ts
    - apps/web/package.json
key-decisions:
  - "Explicitly import defineEventHandler, getRouterParam, getValidatedQuery, createError from h3 in daily.get.ts so Vitest can execute route handlers outside of Nuxt auto-import context."
patterns-established:
  - "Handler + integration test pattern: construct H3Event with createEvent and query params via URLSearchParams, then pass to handler directly."
requirements-completed:
  - API-01
metrics:
  duration: 186
  completed_date: "2026-04-09"
---

# Phase 05 Plan 02: Daily API Route with Cumulative Stats Summary

**Nuxt Nitro `GET /api/projects/:id/daily` endpoint returns zero-filled, long-format daily contributor rows joined with `sum_day` for cumulative commits, backed by passing integration tests.**

## Performance

- **Duration:** 3m 6s
- **Started:** 2026-04-09T04:05:12Z
- **Completed:** 2026-04-09T04:08:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `daily.get.ts` with project existence check, Zod query validation, and a PostgreSQL CTE using `generate_series` to fill missing contributor-days with zeros.
- Left joined `sum_day` to include per-contributor `cumulativeCommits` in the response.
- Rewrote `daily.get.test.ts` from a dynamic-import RED scaffold into direct-handler integration tests using `createEvent` from `h3`.
- Added `drizzle-orm` and `pg` to `apps/web` devDependencies to enable route handler imports in Vitest.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement daily.get.ts route handler** - `90dd135` (feat)
2. **Task 2: Update daily tests to import handler and run integration tests** - `dc6113c` (test)

## Files Created/Modified

- `apps/web/server/api/projects/[id]/daily.get.ts` - Nitro route handler for daily stats
- `apps/web/server/api/projects/[id]/daily.get.test.ts` - Integration tests with DB setup/cleanup
- `apps/web/package.json` - Added `drizzle-orm` and `pg` devDependencies

## Decisions Made

- Explicitly import `h3` utilities in `daily.get.ts` so tests can invoke the handler directly without relying on Nuxt auto-imports, which are unavailable in standalone Vitest.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `drizzle-orm` and `pg` dependencies to `apps/web`**
- **Found during:** Task 1 (writing tests after handler implementation)
- **Issue:** Vitest failed with "Cannot find package 'drizzle-orm'" when importing `daily.get.ts` in tests because `apps/web` did not declare `drizzle-orm` or `pg` in its dependencies or devDependencies.
- **Fix:** Added `"drizzle-orm": "^0.45.2"` and `"pg": "^8.20.0"` to `apps/web/package.json` devDependencies and ran `pnpm install`.
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Verification:** `vitest run server/api/projects/[id]/daily.get.test.ts` passed.
- **Committed in:** `90dd135` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The dependency addition was necessary for the test suite to load route handlers. No scope creep.

## Issues Encountered

- `getValidatedQuery` could not authenticate query strings when `createEvent` was constructed with a raw path instead of a full URL. Fixed by passing the full `http://localhost/api/projects/:id/daily?...` URL to `createEvent`.
- Tests failed when `DATABASE_URL` was not exported in the shell. Verified by explicitly passing `DATABASE_URL=...` to the vitest command, and tests also soft-skip DB assertions when the env var is absent.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Daily data endpoint is fully operational and tested.
- Ready for Plan 05-03 (monthly endpoint) and Phase 06 (Streamgraph frontend).

---
*Phase: 05-api-routes*
*Completed: 2026-04-09*
