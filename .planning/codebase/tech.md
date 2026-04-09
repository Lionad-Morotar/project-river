# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- TypeScript 5.8+ — All application and test code

**Secondary:**
- Vue Single-File Components — `apps/web/app/**/*.vue`
- CSS (Tailwind v4) — `apps/web/assets/css/main.css`
- SQL (PostgreSQL) — Drizzle schema definitions and raw CTE queries in API routes

## Runtime

**Environment:**
- Bun 1.3.10 or Node.js v22 — Runtime for CLI parser and local dev
- Browser (client-side only) — `apps/web` runs as SPA (`ssr: false` in `nuxt.config.ts`)

**Package Manager:**
- pnpm 10.33.0
- Workspace config: `pnpm-workspace.yaml` with `apps/*` and `packages/*`
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Nuxt 4.4.2 — Full-stack Vue framework (`apps/web/`)
- Vue 3.5.32 — UI component layer
- Vue Router 5.0.4 — Client-side routing

**UI/CSS:**
- Nuxt UI 3.1.0 — Component library (`UButton`, `USelectMenu`, etc.)
- Tailwind CSS 4.2.2 — CSS-first configuration via `@import 'tailwindcss'`

**Visualization:**
- D3 v7 (modular) — `d3-shape`, `d3-scale`, `d3-selection`, `d3-array`, `d3-axis`, `d3-brush`, `d3-zoom`, `d3-time-format`

**Database:**
- Drizzle ORM 0.45.2 — Schema definitions and typed queries
- drizzle-kit 0.31.10 — Migrations and studio
- pg 8.20.0 — node-postgres driver

**Utilities:**
- Zod 3.24.0 — API query validation (`apps/web/server/api/**/*.get.ts`)
- h3 1.15.0 — HTTP framework used by Nitro/Nuxt server routes (explicit devDependency for tests)
- VueUse 13.0.0 — Composables (`useDraggable`, `useWindowSize`)

**Testing:**
- Vitest 3.0.0 — Unit and integration tests
- jsdom 29.0.2 — DOM environment for frontend tests
- @vue/test-utils 2.4.0 — Vue component testing utilities

**Tooling:**
- ESLint 9.x with `@antfu/eslint-config` 4.0.0 — Unified lint + format (no Prettier)
- husky 9.x + lint-staged 15.x — Pre-commit lint hook

## Key Dependencies

**Critical:**
- `drizzle-orm` / `drizzle-kit` — Schema, migrations, and typed SQL building
- `pg` — PostgreSQL connection pooling via `Pool`
- `d3-*` modules — Streamgraph rendering, axes, brushing, zooming
- `nuxt` — Dev server, build pipeline, Nitro backend
- `zod` — Runtime validation for API query parameters

**Infrastructure:**
- `vitest` — Fast unit/integration runner
- `@antfu/eslint-config` — Flat ESLint config with Vue + TS + formatter support

## Configuration

**Environment:**
- `.env` at repository root (per `Phase 02` decision)
- Required variable: `DATABASE_URL` — used by `packages/db/src/client.ts` and integration tests
- `.env.example` documents the expected format

**Build:**
- `apps/web/nuxt.config.ts` — Nuxt modules (`@nuxt/ui`, `@vueuse/nuxt`), SPA mode, CSS entry
- `packages/db/drizzle.config.ts` — Migration config pointing at `src/schema`
- `apps/web/vitest.config.ts` — Resolve aliases (`~/`, `@project-river/db/*`)
- `packages/pipeline/vitest.config.ts` — Absolute aliases for `@project-river/db` packages
- `eslint.config.mjs` — Root flat config importing `antfu()`

**DevOps:**
- `docker-compose.yml` — PostgreSQL 16 (`river_postgres`) and pgAdmin 4 (`river_pgadmin`) for local development

## Platform Requirements

**Development:**
- macOS / Linux / Windows with pnpm and Bun or Node v22
- PostgreSQL 16+ (or use provided `docker-compose.yml`)
- Git CLI — `git log --numstat` invoked directly by pipeline parser

**Production:**
- Not yet deployed; Nuxt build targets static SPA + Nitro server routes
- PostgreSQL required as backing store

---

*Stack analysis: 2026-04-09*
*Update after major dependency changes*
