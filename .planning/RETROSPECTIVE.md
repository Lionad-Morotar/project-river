# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-09
**Phases:** 9 | **Plans:** 28 | **Sessions:** 1

### What Was Built
- pnpm monorepo with Nuxt v4 SPA, Tailwind CSS v4, Nuxt UI v4, and VueUse
- PostgreSQL schema (projects, commits, commit_files, daily_stats, sum_day) managed by Drizzle ORM
- Streaming `git log --numstat` parser with `.mailmap` resolution and merge-commit exclusion
- `calcDay` and `sumDay` algorithms for daily and cumulative contributor statistics
- `analyze` CLI that parses a Git repo and persists data to PostgreSQL in chunked batches
- Nuxt Nitro API routes (`/api/projects/:id/daily` and `/api/projects/:id/monthly`) with zero-filling and integration tests
- Interactive D3 Streamgraph with zoom, brush navigator, month highlight, and hovering tooltips
- Draggable month detail panel with current vs cumulative metrics and sorted contributor list
- SVG export with embedded legend and triggered download
- Comprehensive documentation (smart docs, architecture docs, codebase analysis)

### What Worked
- Autonomous phase execution with subagent orchestration scaled well across 9 phases
- Phase 07.1 (QA Review & Auto-Fix) caught cross-cutting issues early and prevented tech debt accumulation
- Vitest workspace configuration and explicit `@project-river/db` workspace dependencies resolved integration gaps
- D3 + Vue integration in SPA mode avoided SSR complexity

### What Was Inefficient
- Some phase plan lists in ROADMAP.md were not updated during execution, leading to stale plan counts in the archive
- Pipeline integration tests require a live PostgreSQL connection; local verification skips them when `DATABASE_URL` is absent
- TypeScript cross-package path mapping in `packages/pipeline` caused persistent IDE diagnostics that needed manual tsconfig tweaks

### Patterns Established
- Pure pnpm workspace (no turbo) with `--filter` orchestration for builds, tests, and lint
- SPA mode (`ssr: false`) for D3-heavy frontend pages
- antfu/eslint-config with flat config and no Prettier
- CSS-first Tailwind v4 via `@import 'tailwindcss'`
- Phase-insertion pattern via decimal numbering (07.1) for urgent reviews or gap closure

### Key Lessons
1. **Explicit workspace dependencies matter** — Implicit tsconfig aliases work in dev/tests but break at production build or root-level test runs. Always declare `workspace:*` dependencies.
2. **Mid-milestone QA phases pay off** — Inserting a dedicated review/auto-fix phase after heavy implementation work caught integration issues that individual phase verifiers missed.
3. **Vitest workspace config is required for monorepo test orchestration** — Without it, root `pnpm test` fails due to alias resolution conflicts across sub-projects.

### Cost Observations
- Model mix: ~100% opus (analytical reasoning, subagent orchestration, architectural decisions)
- Sessions: 1 extended autonomous session
- Notable: High token efficiency achieved through RTK proxy and bats/foreman wrapper on dev operations

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 | 9 | Introduced autonomous execution with subagent orchestration and mid-milestone QA review phase |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 41 passing | Partial (DB tests are integration-only) | N/A |

### Top Lessons (Verified Across Milestones)

1. Workspace dependency declarations prevent production build and root test failures
2. Decimal phase insertion is an effective mechanism for urgent reviews and gap closure

