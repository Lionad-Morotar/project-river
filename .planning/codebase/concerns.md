# Codebase Concerns

**Analysis Date:** 2026-04-09

## Tech Debt

**SPA mode chosen for D3 convenience:**
- Issue: `ssr: false` disables server-side rendering for the entire `apps/web`
- Why: Simplifies D3 DOM lifecycle and avoids hydration mismatches
- Impact: Worse initial load experience, worse SEO, no progressive enhancement
- Fix approach: Isolate D3 to a client-only component wrapper and re-enable SSR once Nuxt/D3 hydration patterns are well-tested

**Raw SQL CTEs in API route handlers:**
- Issue: `daily.get.ts` and `monthly.get.ts` contain large, complex raw SQL strings built with `drizzle-orm/sql`
- Why: Drizzle query builder is awkward for `generate_series` and multi-CTE grid queries
- Impact: No compile-time SQL safety; schema drift breaks routes at runtime; harder to refactor
- Fix approach: Extract SQL into parameterized query builders or views in `packages/db`

**Pipeline CLI shebang hardcoded to `bun`:**
- Issue: `packages/pipeline/src/cli.ts` starts with `#!/usr/bin/env bun`
- Why: Bun chosen for speed during development
- Impact: Portability issue for contributors or CI nodes running only Node.js
- Fix approach: Provide a Node.js-compatible wrapper or remove shebang and expose as `node ./dist/cli.js`

## Known Bugs

(None identified in current codebase.)

## Security Considerations

**No authentication or authorization:**
- Risk: Any user with network access to the web app can query any project ID
- Files: `apps/web/server/api/projects/[id]/daily.get.ts`, `monthly.get.ts`
- Current mitigation: Single-tenant local scope assumed per requirements
- Recommendations: If multi-user access is ever introduced, add session/auth middleware before API routes and validate project ownership

**SQL injection via query parameters in CTEs:**
- Risk: `start` / `end` query strings are interpolated into raw SQL with `sql`${start}::date``
- Files: `apps/web/server/api/projects/[id]/daily.get.ts`, `monthly.get.ts`
- Current mitigation: Zod regex validation (`/^\d{4}-\d{2}-\d{2}$/`) before interpolation
- Recommendations: Keep validation strict; consider moving to parameterized date coercion (`sql`${start}::date` is already parameterized by Drizzle's tagged template`)

## Performance Bottlenecks

**`generateSumDay` deletes and recomputes all cumulative stats per project:**
- Problem: For large repos with years of history, the CTE recalculates every contributor's entire timeline on every analysis run
- File: `packages/pipeline/src/db/sumDay.ts`
- Measurement: Untested with repos > 100k commits
- Cause: Single `DELETE FROM sum_day WHERE project_id = X` followed by full-window `SUM(...) OVER`
- Improvement path: Make `sum_day` generation incremental (append/update only new dates) instead of full regeneration

**Daily API grid CTE generates dense cross-joins:**
- Problem: Date range × contributors can balloon for long-running repos with many contributors
- File: `apps/web/server/api/projects/[id]/daily.get.ts`
- Measurement: Default limit is 1000 rows, but CTE still computes full cross-join before `LIMIT`
- Cause: `generate_series(min_date, max_date, '1 day') CROSS JOIN contributors` builds full grid in memory
- Improvement path: Paginate by date rather than row count, materialize pre-joined views, or stream sparse data and interpolate gaps client-side

## Fragile Areas

**Git parser header detection heuristic:**
- File: `packages/pipeline/src/parser.ts`
- Why fragile: Relies on tab-count (`line.split('\t').length >= 5`) to distinguish header lines from numstat lines
- Common failures: Commit messages containing many tabs could confuse the parser
- Safe modification: Ensure tests cover edge-case messages before changing the heuristic
- Test coverage: Good (`parser.test.ts` covers basic, binary, and empty commits; integration tests with real Git repos)

**Month-boundary batch logic in `analyzeRepo`:**
- File: `packages/pipeline/src/db/analyze.ts`
- Why fragile: Commits are eagerly collected into `allCommits`, then split into month chunks for transactional flushing
- Common failures: Very large repos could exhaust memory during eager collection
- Safe modification: Increase batch awareness without removing month boundaries; test with large history first
- Test coverage: Integration tests in `analyze.test.ts` cover multi-month and incremental cases

**Frontend resize handling:**
- File: `apps/web/app/pages/projects/[id]/index.vue`
- Why fragile: Uses `window.addEventListener('resize', ...)` rather than `ResizeObserver`
- Common failures: Element-level resize (e.g., sidebar toggle) does not trigger update
- Safe modification: Wrap chart container in `ResizeObserver` inside `Streamgraph.vue`
- Test coverage: None for resize behavior

## Scaling Limits

**PostgreSQL single-instance assumption:**
- Current capacity: One local Postgres container via `docker-compose.yml`
- Limit: CPU/memory of host machine; no read replicas or connection pooling beyond a single `pg.Pool`
- Symptoms at limit: Query latency on large `daily_stats`/`sum_day` tables increases
- Scaling path: Add table partitioning by `project_id`/`date`, query result caching, or read replicas

## Dependencies at Risk

**Drizzle ORM rapid evolution:**
- Risk: Drizzle is pre-1.0 and has introduced breaking API changes between minor versions
- Impact: Migration syntax, `drizzle-kit` commands, and SQL template behavior may change
- Migration plan: Pin versions tightly (already done at `0.45.2` ORM / `0.31.10` kit); test upgrades in isolation before bumping

## Missing Critical Features

**Real-time/live updates:**
- Problem: Users must re-run the CLI analyzer to see new commits
- Current workaround: Manual re-analysis
- Blocks: Live dashboard experience
- Implementation complexity: Medium (file watcher or scheduled job + SSE/WebSocket to frontend)
- Note: Explicitly out of scope for Phase 1 per `PROJECT.md`

**Multi-repo comparison:**
- Problem: UI supports only a single project view at a time
- Current workaround: Switch projects via URL
- Blocks: Comparative analysis across repositories
- Implementation complexity: Low–Medium
- Note: Explicitly out of scope for Phase 1

## Test Coverage Gaps

**Route handler error branches:**
- What's not tested: All 400/404 validation paths are tested, but edge cases (e.g., database connection failure mid-request) are not
- Risk: Unhandled promise rejections or uncaught errors could crash the Nitro dev server
- Priority: Medium
- Difficulty to test: Requires simulating `db.execute` failures with mocked exceptions

**Streamgraph interactivity end-to-end:**
- What's not tested: Brush, zoom, and pointer hover behavior in `Streamgraph.vue`
- Risk: D3 event handlers could regress on library upgrades
- Priority: Medium
- Difficulty to test: Requires robust jsdom or Playwright E2E setup for pointer events and D3 transforms

**Large-repo analyzer stress tests:**
- What's not tested: Performance and memory behavior for repositories with >50k commits
- Risk: OOM or excessive transaction duration in production usage
- Priority: Low–Medium
- Difficulty to test: Need fixture repos or synthetic Git history generators

---

*Concerns audit: 2026-04-09*
*Update as issues are fixed or new ones discovered*
