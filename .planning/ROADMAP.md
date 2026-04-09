# Roadmap

## Project

project-river — interactive Git history Streamgraph visualization.

## Phases

- [x] **Phase 1: Setup & Infrastructure** — Monorepo, Nuxt web app, and lint/build pipelines (completed 2026-04-09)
- [x] **Phase 2: Database & Schema** — PostgreSQL schema, Drizzle ORM, and local docker-compose (completed 2026-04-09)
- [ ] **Phase 3: Git Parser & calcDay** — Streaming Git log parser and daily contributor stats
- [ ] **Phase 4: Pipeline CLI & sumDay** — Rolling cumulative stats and CLI entrypoint
- [ ] **Phase 5: API Routes** — Daily and monthly aggregation endpoints
- [ ] **Phase 6: Streamgraph Visualization** — D3 Streamgraph, month selector, and hover tooltips
- [ ] **Phase 7: Detail Panel & Export** — Month detail panel and SVG export

## Phase Details

### Phase 1: Setup & Infrastructure
**Goal**: Developer has a working monorepo with web app and build pipelines
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. Developer can run `pnpm dev` and see the Nuxt app running locally
  2. Developer can run `pnpm build` across the monorepo via `pnpm --filter`
  3. Developer can run `pnpm lint` without errors
**Plans**: 3 plans

Plan list:
- [x] `01-01-PLAN.md` — Monorepo skeleton: pnpm workspace, root package.json, directory structure
- [x] `01-02-PLAN.md` — Nuxt app setup: generate minimal template, SPA mode, Tailwind v4, Nuxt UI, VueUse
- [x] `01-03-PLAN.md` — Linting & dev tooling: antfu/eslint-config, husky + lint-staged, passing `pnpm lint`

**UI hint**: yes

### Phase 2: Database & Schema
**Goal**: PostgreSQL database is running locally with Drizzle-managed schema
**Depends on**: Phase 1
**Requirements**: DB-01, DB-02, DB-03
**Success Criteria** (what must be TRUE):
  1. Developer can start PostgreSQL locally with `docker-compose up`
  2. Drizzle migrations apply successfully and create all required tables
  3. Application code can connect to the database and execute queries
**Plans**: 3 plans

Plan list:
- [x] `02-01-PLAN.md` — Drizzle ORM setup: packages/db package, client, and config
- [x] `02-02-PLAN.md` — Schema definition: core.ts (projects, commits, commit_files) and stats.ts (daily_stats, sum_day)
- [x] `02-03-PLAN.md` — Local PostgreSQL: docker-compose with pgAdmin, env setup, and migration verification

### Phase 3: Git Parser & calcDay
**Goal**: Git repositories can be parsed into daily contributor statistics
**Depends on**: Phase 2
**Requirements**: PIPE-01, PIPE-02
**Success Criteria** (what must be TRUE):
  1. Running the parser on a Git repo produces a stream of parsed commits
  2. Merge-commit duplicates are correctly handled and not double-counted
  3. calcDay generates accurate daily contributor commit counts per day
**Plans**: 3 plans

Plan list:
- [ ] `03-01-PLAN.md` — Parser package: bootstrap `@project-river/pipeline`, implement streaming `git log --numstat` parser and tests
- [ ] `03-02-PLAN.md` — Schema fix: add `filesTouched` column to `daily_stats` and generate Drizzle migration
- [ ] `03-03-PLAN.md` — calcDay algorithm: daily contributor aggregation with UTC day buckets and unit tests

### Phase 4: Pipeline CLI & sumDay
**Goal**: Complete CLI tool persists parsed repo data to database with cumulative stats
**Depends on**: Phase 3
**Requirements**: PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. Running `analyze <repo-path>` writes commits and daily stats to PostgreSQL
  2. Large repositories are processed in chunked batches without memory issues
  3. sumDay computes correct rolling cumulative statistics from daily stats
**Plans**: TBD

### Phase 5: API Routes
**Goal**: Backend exposes project data for visualization consumption
**Depends on**: Phase 4
**Requirements**: API-01, API-02
**Success Criteria** (what must be TRUE):
  1. `GET /api/projects/:id/daily` returns day-level contributor data
  2. `GET /api/projects/:id/monthly` returns monthly aggregated metrics
  3. API responses match the shape expected by the Streamgraph frontend
**Plans**: TBD

### Phase 6: Streamgraph Visualization
**Goal**: Users can explore repository contribution flow interactively
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. User sees a colored Streamgraph with one layer per contributor
  2. User can hover over any layer to see contributor name, date, and commit count
  3. User can select a month via brushing/selector to highlight it on the graph
**Plans**: TBD
**UI hint**: yes

### Phase 7: Detail Panel & Export
**Goal**: Users can inspect monthly details and export the visualization
**Depends on**: Phase 6
**Requirements**: UI-04, EXPORT-01
**Success Criteria** (what must be TRUE):
  1. User sees a detail panel showing current vs cumulative metrics for selected month
  2. Detail panel displays top contributors list for the selected month
  3. User can click an export button to download the Streamgraph as an SVG file
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Setup & Infrastructure | 3/3 | Complete    | 2026-04-09 |
| 2. Database & Schema | 3/3 | Complete    | 2026-04-09 |
| 3. Git Parser & calcDay | 1/3 | In Progress|  |
| 4. Pipeline CLI & sumDay | 0/3 | Not started | - |
| 5. API Routes | 0/3 | Not started | - |
| 6. Streamgraph Visualization | 0/3 | Not started | - |
| 7. Detail Panel & Export | 0/3 | Not started | - |
