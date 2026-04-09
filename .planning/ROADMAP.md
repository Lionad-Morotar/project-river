# Roadmap

## Project

project-river — interactive Git history Streamgraph visualization.

## Phases

- [x] **Phase 1: Setup & Infrastructure** — Monorepo, Nuxt web app, and lint/build pipelines (completed 2026-04-09)
- [x] **Phase 2: Database & Schema** — PostgreSQL schema, Drizzle ORM, and local docker-compose (completed 2026-04-09)
- [x] **Phase 3: Git Parser & calcDay** — Streaming Git log parser and daily contributor stats (completed 2026-04-09)
- [x] **Phase 4: Pipeline CLI & sumDay** — Rolling cumulative stats and CLI entrypoint (completed 2026-04-09)
- [x] **Phase 5: API Routes** — Daily and monthly aggregation endpoints (completed 2026-04-09)
- [x] **Phase 6: Streamgraph Visualization** — D3 Streamgraph, month selector, and hover tooltips (completed 2026-04-09)
- [ ] **Phase 7: Detail Panel & Export** — Month detail panel and SVG export
- [ ] **Phase 8: Documentation** — Smart docs, understand docs, and codebase planning updates

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
- [x] `03-01-PLAN.md` — Parser package: bootstrap `@project-river/pipeline`, implement streaming `git log --numstat` parser and tests
- [x] `03-02-PLAN.md` — Schema fix: add `filesTouched` column to `daily_stats` and generate Drizzle migration
- [x] `03-03-PLAN.md` — calcDay algorithm: daily contributor aggregation with UTC day buckets and unit tests

### Phase 4: Pipeline CLI & sumDay
**Goal**: Complete CLI tool persists parsed repo data to the database with cumulative stats
**Depends on**: Phase 3
**Requirements**: PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. Running `analyze <repo-path>` writes commits and daily stats to PostgreSQL
  2. Large repositories are processed in chunked batches without memory issues
  3. sumDay computes correct rolling cumulative statistics from daily stats
**Plans**: 3 plans

Plan list:
- [ ] `04-01-PLAN.md` — sumDay SQL generation: PostgreSQL CTE with window functions and integration tests
- [ ] `04-02-PLAN.md` — analyze persistence core: month-boundary chunked writes, force/incremental modes, integration tests
- [ ] `04-03-PLAN.md` — CLI entrypoint: `analyze` command with parseArgs, bin registration, and CLI unit tests

### Phase 5: API Routes
**Goal**: Backend exposes project data for visualization consumption
**Depends on**: Phase 4
**Requirements**: API-01, API-02
**Success Criteria** (what must be TRUE):
  1. `GET /api/projects/:id/daily` returns day-level contributor data
  2. `GET /api/projects/:id/monthly` returns monthly aggregated metrics
  3. API responses match the shape expected by the Streamgraph frontend
**Plans**: 3 plans

Plan list:
- [x] `05-01-PLAN.md` — Test scaffolds and tooling: install zod, add apps/web vitest config, create failing daily/monthly test scaffolds
- [x] `05-02-PLAN.md` — Daily endpoint: implement `GET /api/projects/:id/daily` with generate_series zero-filling, sum_day join, and passing tests
- [ ] `05-03-PLAN.md` — Monthly endpoint: implement `GET /api/projects/:id/monthly` with month aggregation, zero-filling, and passing tests

### Phase 6: Streamgraph Visualization
**Goal**: Users can explore repository contribution flow interactively
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. User sees a colored Streamgraph with one layer per contributor
  2. User can hover over any layer to see contributor name, date, and commit count
  3. User can select a month via brushing/selector to highlight it on the graph
**Plans**: 3 plans

Plan list:
- [ ] `06-01-PLAN.md` — D3 foundation: install d3-* packages, create `useContributorColors` and `d3Helpers` utilities with unit tests
- [ ] `06-02-PLAN.md` — Streamgraph component: build `Streamgraph.vue` with D3 zoom, brush navigator, and month highlight; add `StreamgraphTooltip.vue`
- [ ] `06-03-PLAN.md` — Page integration: create `/projects/[id]` page, `MonthSelector.vue`, wire data fetching, tooltip, and build verification

**UI hint**: yes

### Phase 7: Detail Panel & Export
**Goal**: Users can inspect monthly details and export the visualization
**Depends on**: Phase 6
**Requirements**: UI-04, EXPORT-01
**Success Criteria** (what must be TRUE):
  1. User sees a detail panel showing current vs cumulative metrics for selected month
  2. Detail panel displays top contributors list for the selected month
  3. User can click an export button to download the Streamgraph as an SVG file
**Plans**: 3 plans
**UI hint**: yes

Plan list:
- [ ] `07-01-PLAN.md` — Month detail panel: helper utilities and draggable `MonthDetailPanel.vue`
- [ ] `07-02-PLAN.md` — SVG export: expose D3 SVG node, serialization utility, and unit tests
- [ ] `07-03-PLAN.md` — Page integration: wire panel, bidirectional month sync, auto-select, and build verification

### Phase 07.1: QA Review & Auto-Fix

**Goal**: Run focused code reviews on `packages/db`, `packages/pipeline`, and `apps/web`; collect findings into structured markdown documents; auto-fix critical/blocking issues.
**Depends on**: Phase 7
**Requirements**: DB-01, DB-02, DB-03, PIPE-01, PIPE-02, PIPE-03, PIPE-04, API-01, API-02, UI-01, UI-02, UI-03, UI-04, EXPORT-01, INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. Three structured review documents exist in the phase directory
  2. Each review covers code quality, type safety, test coverage, and architectural consistency
  3. Pipeline lint passes without blocking errors
  4. Web tests pass when DATABASE_URL is absent
  5. No regressions are introduced by auto-fixes
**Plans**: 4 plans

Plan list:
- [ ] `07.1-01-PLAN.md` — Review packages/db: schema, client, migrations, and configuration
- [ ] `07.1-02-PLAN.md` — Review packages/pipeline: parser, calcDay, sumDay, analyze, CLI, and tests
- [ ] `07.1-03-PLAN.md` — Review apps/web: API routes, Streamgraph components, detail panel, and pages
- [ ] `07.1-04-PLAN.md` — Auto-fix critical issues: pipeline lint failures and brittle web API tests

### Phase 8: Documentation
**Goal**: 使用智能子代理为项目生成全面的源代码文档和架构文档，更新项目知识库
**Depends on**: Phase 3 (or later)
**Requirements**: DOCS-01, DOCS-02, DOCS-03
**Success Criteria** (what must be TRUE):
  1. 所有关键源码包都有 `smart-docs` 生成的文档
  2. 项目整体有 `understand` 生成的架构文档
  3. `.planning/codebase` 目录下各文档已更新并反映当前代码库状态
**Plans**: 3 plans

Plan list:
- [ ] `08-01-PLAN.md` — Source code smart docs: apps/web, packages/db, packages/pipeline
- [ ] `08-02-PLAN.md` — Project understand documentation
- [ ] `08-03-PLAN.md` — Update .planning/codebase documents with 4 subagents

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Setup & Infrastructure | 3/3 | Complete    | 2026-04-09 |
| 2. Database & Schema | 3/3 | Complete    | 2026-04-09 |
| 3. Git Parser & calcDay | 3/3 | Complete    | 2026-04-09 |
| 4. Pipeline CLI & sumDay | 1/3 | Complete    | 2026-04-09 |
| 5. API Routes | 2/3 | Complete    | 2026-04-09 |
| 6. Streamgraph Visualization | 3/3 | Complete    | 2026-04-09 |
| 7. Detail Panel & Export | 0/3 | Not started | - |
| 8. Documentation | 1/3 | In Progress|  |
