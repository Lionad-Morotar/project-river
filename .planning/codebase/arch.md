# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Monorepo with layered packages — a CLI-driven ETL pipeline feeding a Nuxt-based web explorer.

**Key Characteristics:**
- CLI is the ingestion engine; web app is read-only visualization
- Pure pnpm workspaces (no Turbo)
- SPA mode on the frontend (`ssr: false`) to simplify D3 lifecycle
- Database-first persistence: raw Git output -> structured tables -> pre-aggregated cumulative stats

## Layers

**Apps Layer — `apps/web/`**
- Purpose: Interactive Streamgraph explorer and contributor dashboard
- Contains: Nuxt pages, Vue components, composables, utility helpers, Nitro API routes
- Depends on: `packages/db` (schema types and client), PostgreSQL
- Entry point: `apps/web/app/pages/projects/[id]/index.vue`

**Database Package — `packages/db/`**
- Purpose: Schema definition, migration management, and shared DB client
- Contains: Drizzle table definitions (`core.ts`, `stats.ts`), `Pool`-based client
- Depends on: `drizzle-orm`, `pg`, `DATABASE_URL`
- Used by: `apps/web` (server routes), `packages/pipeline` (CLI analysis)

**Pipeline Package — `packages/pipeline/`**
- Purpose: Git log streaming parser, daily stat computation, and batch DB importer
- Contains: `parser.ts`, `calcDay.ts`, `db/analyze.ts`, `db/sumDay.ts`, `cli.ts`
- Depends on: `packages/db`, Node.js `child_process`, `readline`
- Triggers: CLI invocation (`bun ./src/cli.ts <repo-path> [project-name]`)

## Data Flow

**Ingestion Flow (CLI-driven):**

1. User runs analyzer: `bun packages/pipeline/src/cli.ts /path/to/repo`
2. `cli.ts` → `analyzeRepo()` in `packages/pipeline/src/db/analyze.ts`
3. `parseRepo()` spawns `git log --no-merges --date=iso-strict --format=%H\t%aN\t%aE\t%cd\t%s --numstat`
4. Streamed commits collected month-by-month
5. `calcDay()` aggregates commits into daily per-contributor stats
6. Month batched into a Drizzle transaction:
   - Insert rows into `commits`
   - Insert rows into `commit_files`
   - Insert aggregated rows into `daily_stats`
7. `generateSumDay()` runs a SQL CTE to compute cumulative stats and writes to `sum_day`

**Visualization Flow (HTTP request):**

1. Browser loads `projects/[id]` page
2. `index.vue` fetches `/api/projects/{id}/daily` and `/api/projects/{id}/monthly`
3. `daily.get.ts` returns a `daily_stats`/`sum_day` joined grid with cumulative commits
4. `monthly.get.ts` returns per-month aggregates across `daily_stats`
5. `Streamgraph.vue` pivots daily rows and renders a D3 stacked area chart with brush + zoom
6. `MonthDetailPanel.vue` displays metrics and draggable contributor list

**State Management:**
- Persistent state lives in PostgreSQL only
- Frontend holds ephemeral refs (`dailyData`, `selectedMonth`, tooltip position)
- No global store (Pinia/Vuex not used)

## Key Abstractions

**ParsedCommit / DailyStat:**
- Purpose: Canonical shapes for parsed Git output and computed daily aggregates
- Location: `packages/pipeline/src/types.ts`, `packages/pipeline/src/calcDay.ts`
- Pattern: Plain interfaces + pure functions

**ContributorColors:**
- Purpose: Deterministic HSL color assignment via golden-angle distribution
- Location: `apps/web/app/composables/useContributorColors.ts`
- Pattern: Utility composable returning a `Map<string, string>`

**Grid CTE Queries:**
- Purpose: Fill gaps in sparse time-series by generating date ranges and cross-joining contributors
- Location: `apps/web/server/api/projects/[id]/daily.get.ts`, `monthly.get.ts`
- Pattern: SQL `generate_series` + `LEFT JOIN` to guarantee every date/contributor tuple exists

## Entry Points

**Web App:**
- Location: `apps/web/app/app.vue`
- Triggers: Nuxt dev server or production build
- Responsibilities: Root layout, renders `<NuxtPage />`

**API Routes:**
- Location: `apps/web/server/api/projects/[id]/daily.get.ts`, `monthly.get.ts`
- Triggers: HTTP GET from frontend `$fetch`
- Responsibilities: Validate query with Zod, guard project existence, execute raw CTE SQL, map rows to JSON

**CLI Analyzer:**
- Location: `packages/pipeline/src/cli.ts`
- Triggers: Direct `bun` invocation or `pnpm --filter @project-river/pipeline exec analyze`
- Responsibilities: Parse CLI args, call `analyzeRepo()`, exit on error

## Error Handling

**Strategy:** Fail fast at boundaries; throw and let callers handle.

**Patterns:**
- Zod schema validation in API route handlers (`getValidatedQuery`) returns HTTP 400 on mismatch
- `createError({ statusCode: 404 })` when project ID not found
- `git log` exit code checked in parser; throws `Error('git log exited with code X')` on failure
- `analyzeRepo` throws on duplicate project unless `--force` or `--incremental` is set

## Cross-Cutting Concerns

**Validation:**
- Zod query schemas in both `daily.get.ts` and `monthly.get.ts` enforce `YYYY-MM-DD` and numeric bounds

**Logging:**
- No structured logging layer; console errors from CLI, minimal browser console usage

**Database Access:**
- Single `Pool` instance exported from `packages/db/src/client.ts`
- Raw SQL (`db.execute(sql...)`) preferred for complex CTEs in API routes
- Drizzle ORM used for CRUD/transaction work in pipeline analyzer

---

*Architecture analysis: 2026-04-09*
*Update when major patterns change*
