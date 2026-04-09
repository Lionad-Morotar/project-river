# project-river

## What This Is

An interactive Git history visualization tool that renders contributor activity as a **Streamgraph (河流图)** over time. Users analyze a Git repository via CLI, persist data to PostgreSQL, and explore the results through a Nuxt v4 web application.

Project codename: **project-river**.

## Core Value

Make Git repository evolution visceral and explorable. Instead of reading `git log`, users see *who* contributed *when*, at *what intensity*, and how the codebase grew over time — all in a single flowing visual.

## Context

### Problem

Traditional Git history tools are either too granular (commit-by-commit lists) or too abstract (aggregate bar charts). Neither conveys the *flow* of contributor activity across time.

### Vision

A Streamgraph-based visualization where:
- Each colored layer represents a single contributor
- The x-axis is time (day-level precision)
- The y-axis height represents commits (or other contribution metrics)
- Users can hover for details, select months for inspection, and export the view as SVG

### Target User

Developers, maintainers, and project leads who want an intuitive, time-based overview of repository health and contributor patterns.

## Requirements

### Validated

- ✓ **INFRA-01**: Initialize monorepo with pnpm workspace — v1.0
- ✓ **INFRA-02**: Bootstrap `apps/web` with Nuxt v4, Nuxt UI v4, Tailwind CSS v4, and VueUse — v1.0
- ✓ **DB-01**: Set up PostgreSQL schema and Drizzle ORM in `packages/db` — v1.0
- ✓ **DB-02**: Configure Drizzle ORM and migrations in `packages/db` — v1.0
- ✓ **DB-03**: Provide docker-compose for local PostgreSQL and verify migration succeeds — v1.0
- ✓ **PIPE-01**: Implement streaming Git log parser (`git log --numstat`) with `--no-merges` — v1.0
- ✓ **PIPE-02**: Implement `calcDay` algorithm to compute daily contributor statistics — v1.0
- ✓ **PIPE-03**: Implement `sumDay` algorithm to compute rolling cumulative statistics — v1.0
- ✓ **PIPE-04**: Build CLI entrypoint (`analyze`) that parses a repo and writes to PostgreSQL — v1.0
- ✓ **API-01**: `GET /api/projects/:id/daily` returns daily contributor data — v1.0
- ✓ **API-02**: `GET /api/projects/:id/monthly` returns monthly aggregated metrics — v1.0
- ✓ **UI-01**: Render interactive Streamgraph with D3 (`d3.stack` + `d3.area` + `wiggle`) — v1.0
- ✓ **UI-02**: Implement month selector/brushing that highlights the selected month — v1.0
- ✓ **UI-03**: Show tooltip on hover over contributor layer — v1.0
- ✓ **UI-04**: Build month detail panel with Current vs Cumulative metrics and top contributors — v1.0
- ✓ **EXPORT-01**: Add SVG export button that serializes the D3-generated SVG — v1.0

### Active

- [ ] **V2-01**: Multi-repository comparison view
- [ ] **V2-02**: Real-time/live background updates to analysis
- [ ] **V2-03**: User authentication and multi-tenancy
- [ ] **V2-04**: Canvas/WebGL rendering for 100k+ node performance

### Out of Scope

- **Non-PostgreSQL databases** — Locked to Postgres for relational time-series queries
- **Mobile-first responsive design** — Phase 1 targets desktop analytics view
- **PDF/PNG raster export** — SVG is sufficient for v1.0

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Streamgraph over Sankey | Better time-series fit; canonical precedents exist for contributor flow | Locked |
| PostgreSQL over SQLite | Handles large-repo time-series data predictably; Drizzle ecosystem alignment | Locked |
| HSL dynamic color generation | Unlimited contributor layers without merging to "Others" | Locked |
| Day-level x-axis precision | Balances visual fidelity with dataset size for multi-year repos | Locked |
| pnpm workspace monorepo | Clear separation between `apps/web`, `packages/db`, and `packages/api`. No turbo — use pnpm `--filter` for task orchestration. | Locked |
| Bun 1.3.10 / Node v22 runtime | Speed for CLI parsing; Nuxt v4 compatibility | Locked |

## Tech Stack

- **Runtime**: Bun 1.3.10 / Node v22
- **Package Manager**: pnpm 10.33.0
- **Monorepo**: pnpm workspaces
- **Frontend**: Nuxt v4 (SPA mode), Nuxt UI v4, Tailwind CSS v4, VueUse
- **Visualization**: D3 (`d3-shape`, `d3-scale`, `d3-selection`, `d3-array`, `d3-axis`, `d3-brush`, `d3-zoom`, `d3-time-format`)
- **Database**: PostgreSQL 16 + Drizzle ORM
- **CLI Parser**: Native `git log --numstat` stream parser

## Context

**Shipped v1.0 on 2026-04-09** with ~23k lines of code across 113 files.
- 9 phases, 28 plans, 36 tasks completed
- 11 test files, 41 tests passing
- End-to-end flow verified: CLI `analyze` → PostgreSQL → Nuxt API → D3 Streamgraph → SVG export
- Cross-cutting QA review (Phase 07.1) fixed pipeline lint and brittle test issues
- Documentation generated for all major packages and architecture

**Known technical debt** (non-blocking):
- Root `vitest.workspace.ts` uses deprecated `defineWorkspace` pattern (fixed during audit)
- Minor TypeScript cross-package path-mapping warnings in `packages/pipeline` IDE diagnostics
- Pipeline integration tests require live `DATABASE_URL` and skip gracefully when absent

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-04-09 after v1.0 milestone completion*
