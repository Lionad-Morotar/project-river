---
phase: 04-pipeline-cli-sumday
plan: 02
subsystem: database
tags: [drizzle, postgres, git, vitest, streamgraph]

requires:
  - phase: 04-pipeline-cli-sumday
    provides: sumDay SQL generation with PostgreSQL CTE window functions

provides:
  - analyzeRepo persistence engine with calendar-month transaction batching
  - Chunked insert strategy for commits, commit_files, and daily_stats
  - Force (--force) and incremental (--incremental) rerun behaviors
  - PostgreSQL integration tests verifying end-to-end persistence

affects:
  - 04-pipeline-cli-sumday
  - packages/pipeline
  - packages/db

tech-stack:
  added: []
  patterns:
    - Eagerly collect streamed commits before DB transactions to avoid child-process stream stalls in test workers
    - Month-boundary batching with per-calendar-month transactions and configurable chunk size

key-files:
  created:
    - packages/pipeline/src/db/analyze.ts
    - packages/pipeline/tests/analyze.test.ts
    - .env.example
  modified:
    - packages/pipeline/src/index.ts
    - packages/pipeline/tsconfig.json
    - packages/db/src/client.ts

key-decisions:
  - "Interleaving async generator consumption with long-running DB transactions caused git log child-process stdout to stall in vitest fork workers; eager collection of commits before month-boundary DB work resolved this without losing the streaming parser design"

patterns-established:
  - "Analyze operations buffer commits by UTC calendar month and flush each month in its own PostgreSQL transaction"
  - "Integration tests that touch PostgreSQL must call pool.end() in afterAll to allow vitest workers to exit cleanly"

requirements-completed:
  - PIPE-04

# Metrics
duration: 18min
completed: 2026-04-09
---

# Phase 4 Plan 2: analyzeRepo persistence core with force/incremental integration tests

**Month-boundary PostgreSQL persistence engine with chunked inserts, force overwrite, incremental append, and end-to-end integration test coverage**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-09T03:10:28Z
- **Completed:** 2026-04-09T03:28:52Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Implemented `analyzeRepo` that streams parsed Git commits into PostgreSQL using Drizzle ORM
- Batched inserts by UTC calendar month with per-month transactions and configurable chunk size
- Added `--force` cascade-delete-and-reinsert and `--incremental` SHA-set-deduplication behaviors
- Wrote integration tests covering force overwrite, duplicate rejection, and incremental append

## Task Commits

1. **Task 1: Implement analyzeRepo persistence core** - `e931cde` (feat)
2. **Task 2: Create analyze integration tests and .env.example** - `dfefedb` (test)

## Files Created/Modified
- `packages/pipeline/src/db/analyze.ts` - analyzeRepo orchestration with month-boundary batching, force/incremental support, and chunked inserts
- `packages/pipeline/src/index.ts` - Added export for `db/analyze.ts`
- `packages/pipeline/tests/analyze.test.ts` - Integration tests for force, reject-duplicate, and incremental modes
- `.env.example` - Required environment variable template with `DATABASE_URL`
- `packages/db/src/client.ts` - Exported `pool` for clean test teardown
- `packages/pipeline/tsconfig.json` - Added `@project-river/db` path mappings

## Decisions Made
- None beyond implementation details; followed plan as specified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Interleaved async generator consumption with DB transactions caused child-process stdout stalls in vitest forks**
- **Found during:** Task 2 (integration test execution)
- **Issue:** `for await (const commit of parseRepo(repoPath))` paused the generator during `flushMonth()` DB transactions, causing the `git log` child process stdout to stall in vitest's forked worker environment; tests with 2+ month flushes timed out at 15-30s
- **Fix:** Refactored `analyzeRepo` to eagerly collect all commits from `parseRepo` into an array first, then process month-boundary flushes sequentially without interleaving stream consumption and DB work
- **Files modified:** `packages/pipeline/src/db/analyze.ts`
- **Verification:** All 3 analyze integration tests pass in under 1s; standalone script also confirmed correct behavior
- **Committed in:** `dfefedb` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Pool connections kept vitest workers alive after test completion**
- **Found during:** Task 2 (test debugging)
- **Issue:** `node-postgres` Pool maintains idle connections that prevent vitest fork processes from exiting cleanly after test assertions complete
- **Fix:** Exported `pool` from `packages/db/src/client.ts` and added `await pool.end()` in `analyze.test.ts` `afterAll`
- **Files modified:** `packages/db/src/client.ts`, `packages/pipeline/tests/analyze.test.ts`
- **Verification:** Test suite exits cleanly without hanging
- **Committed in:** `dfefedb` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes are correctness/infrastructure improvements required for reliable test execution. No scope creep.

## Issues Encountered
- Vitest worker child-process behavior differs from standalone Node scripts when interleaving async generator consumption with long-running async DB transactions; eager collection resolved this while preserving the streaming parser architecture

## User Setup Required
- Create root `.env` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/river` to run integration tests (documented in `.env.example`)

## Next Phase Readiness
- analyzeRepo is ready for CLI wrapper integration in 04-03
- No blockers

---
*Phase: 04-pipeline-cli-sumday*
*Completed: 2026-04-09*
