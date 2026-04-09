# Phase 2: Database & Schema - Research

**Researched:** 2026-04-09
**Domain:** PostgreSQL + Drizzle ORM in a pnpm workspace monorepo
**Confidence:** HIGH

## Summary

This phase establishes the data layer for project-river: a PostgreSQL database running in Docker Compose, with schema managed by Drizzle ORM inside a `packages/db` workspace package. The stack is well-documented and greenfield, so we have full control over conventions.

Drizzle ORM (v0.45.2) with drizzle-kit (v0.31.10) is the standard TypeScript-first PostgreSQL toolkit in 2025. For a Bun/Node v22 runtime, there are two viable drivers: the native `pg` driver and the pure-JS `postgres.js` driver. The 2025 consensus is that `postgres.js` is faster on Bun and has no native bindings, but `pg` is more mature for streaming and has broader ecosystem support. Given this project's primary consumers are a Nuxt server and a CLI pipeline (not high-throughput serverless edge functions), `pg` remains a safe, conservative choice with zero compatibility risk. However, `postgres.js` is equally valid and slightly more performant on Bun. This research recommends `pg` as the default but notes `postgres.js` as an accepted alternative.

Migrations in Drizzle are forward-only and rely on a `meta/` directory inside the configured `out` folder. The standard workflow is `generate` (creates SQL from schema diff) followed by `migrate` (applies SQL to the database). Auto-applying migrations on startup is an anti-pattern per the user's explicit decision; instead, a `pnpm db:migrate` script will run migrations explicitly.

Schema organization will follow the locked domain-driven split: `core.ts` for projects/commits/commit_files and `stats.ts` for daily_stats/sum_day, exported from a unified `index.ts`.

**Primary recommendation:** Use `drizzle-orm` + `pg` driver inside `packages/db`, expose `drizzle.config.ts` from that package, use `drizzle-kit generate` and `drizzle-kit migrate` via pnpm scripts, and keep docker-compose.yml at the repository root alongside `.env`.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Include both PostgreSQL and pgAdmin services in `docker-compose.yml` (or `docker-compose.dev.yml`). pgAdmin provides a full-featured management interface for development and debugging.
- **D-02:** Adopt domain-driven file organization within `packages/db/src/schema/`.
  - `core.ts` — `projects`, `commits`, `commit_files`
  - `stats.ts` — `daily_stats`, `sum_day`
- **D-03:** Export a unified schema object from `packages/db/src/schema/index.ts` for Drizzle config and consumers.
- **D-04:** Migrations are applied explicitly via a pnpm script (e.g., `pnpm db:migrate`). Do NOT auto-apply migrations on application startup.
- **D-IX-01:** `daily_stats` table must have a composite index on `(project_id, date)` for efficient time-range queries by the API.
- **D-IX-02:** `sum_day` table must have a composite index on `(project_id, date)` for cumulative lookups.
- **D-IX-03:** `commits` table must have a composite index on `(project_id, committer_date)` to support incremental analysis and date filtering.
- **D-05:** `.env` file lives at the repository root.
- **D-06:** Connection string variable is named `DATABASE_URL`.
- **D-07:** Both `packages/db` and `apps/web` read from the root `.env` (or rely on the environment being injected at runtime).

### Claude's Discretion
- Exact Drizzle `dialect` and `driver` configuration details (e.g., `pg` vs `postgres.js`).
- pgAdmin port and default credentials for local development.
- Whether to add an initial seed script for testing.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within Phase 2 scope.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-01 | Define PostgreSQL schema for `projects`, `commits`, `commit_files`, `daily_stats`, and `sum_day` tables | Drizzle `pg-core` provides `pgTable`, `serial`, `varchar`, `text`, `integer`, `timestamp`, `date`, `index`, and `references`. Modern index syntax uses an array callback `(table) => [...]` as of 2024-2025. |
| DB-02 | Configure Drizzle ORM and migrations in `packages/db` | Standard monorepo pattern: dedicate a workspace package, install `drizzle-orm` + `pg` + `drizzle-kit` + `@types/pg`, create `drizzle.config.ts`, and expose `db:migrate` / `db:generate` scripts. Verified versions: `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `pg@8.20.0`. |
| DB-03 | Provide docker-compose for local PostgreSQL and verify migration succeeds | Docker Compose with `postgres:16` + `dpage/pgadmin4` is the canonical local dev stack. pgAdmin defaults to port 80 inside the container, commonly mapped to host port 5050. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.2 | Type-safe ORM and query builder | Drizzle is the locked choice; zero-dependency core, excellent TS inference |
| `drizzle-kit` | 0.31.10 | CLI for generating and applying migrations | Official companion tool; required for DDL diffing and migration orchestration |
| `pg` | 8.20.0 | PostgreSQL driver for Node.js/Bun | Mature, streaming support, large ecosystem. `postgres.js` is a valid performance-first alternative but `pg` is lower risk |
| `@types/pg` | 8.11.x | TypeScript types for `pg` | Required for proper typing when using `pg` driver with Drizzle |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `postgres` | 3.4.9 | Alternative pure-JS PostgreSQL driver | If Bun performance becomes critical later; drop-in replacement with minor import changes |
| `dotenv` | 16.x | Load `.env` into process.env | In `packages/db` scripts or CLI entrypoints that need env variables before drizzle-kit runs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg` | `postgres` (postgres.js) | `postgres` is ~10-30% faster on Bun and has no native deps, but `pg` has more mature streaming/pooling and broader tooling support |
| `drizzle-kit migrate` | Programmatic migration with `migrate()` helper | Programmatic is useful for app startup auto-migration, but that is explicitly forbidden per D-04 |

**Installation:**
```bash
# Inside packages/db
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

**Version verification:**
```bash
npm view drizzle-orm version  # 0.45.2
npm view drizzle-kit version  # 0.31.10
npm view pg version           # 8.20.0
npm view postgres version     # 3.4.9
```

---

## Architecture Patterns

### Recommended Project Structure
```
packages/db/
├── src/
│   ├── schema/
│   │   ├── core.ts          # projects, commits, commit_files
│   │   ├── stats.ts         # daily_stats, sum_day
│   │   └── index.ts         # unified export of all tables
│   ├── client.ts            # pg Pool + drizzle(db) instance
│   └── index.ts             # public package export (re-exports schema + db)
├── drizzle.config.ts        # drizzle-kit configuration
├── drizzle/                 # generated migrations + meta/ (git-tracked)
│   ├── 0000_init.sql
│   └── meta/
│       ├── _journal.json
│       └── 0000_snapshot.json
└── package.json             # db:migrate, db:generate, db:studio scripts
```

### Pattern 1: Domain-Driven Schema Files
**What:** Split tables by domain (core vs stats) rather than one monolithic file or per-table files.
**When to use:** When table count is moderate and domain boundaries are clear, as they are here.
**Example:**
```typescript
// packages/db/src/schema/core.ts
import { pgTable, serial, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).defaultNow().notNull(),
});

export const commits = pgTable('commits', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  hash: varchar('hash', { length: 40 }).notNull(),
  authorName: varchar('author_name', { length: 255 }).notNull(),
  authorEmail: varchar('author_email', { length: 320 }),
  committerDate: timestamp('committer_date', { mode: 'date', precision: 3, withTimezone: true }).notNull(),
  message: text('message'),
}, (table) => [
  index('commits_project_date_idx').on(table.projectId, table.committerDate),
]);
```

### Pattern 2: Unified Schema Export
**What:** Export all tables from `schema/index.ts` so Drizzle config and consumers reference a single source of truth.
**When to use:** Required for monorepos where multiple apps consume the same schema.
**Example:**
```typescript
// packages/db/src/schema/index.ts
export * from './core';
export * from './stats';
```

### Pattern 3: Drizzle Config in the DB Package
**What:** Keep `drizzle.config.ts` inside `packages/db` and point `schema` to `./src/schema/index.ts`.
**When to use:** Standard for a dedicated database package.
**Example:**
```typescript
// packages/db/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Pattern 4: Client Initialization
**What:** Create a single `db` instance in `src/client.ts` using a `pg` Pool.
**When to use:** Every package/app that needs to query the database imports from `@project-river/db`.
**Example:**
```typescript
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

### Anti-Patterns to Avoid
- **Auto-migrate on startup:** Do not call `migrate()` inside `client.ts` or app bootstrap code. Per D-04, migrations must be explicit (`pnpm db:migrate`).
- **Untracked migrations:** The `drizzle/` directory (including `meta/`) must be committed to git. Deleting `meta/_journal.json` breaks `drizzle-kit generate`.
- **Using `drizzle-kit push` in production:** `push` is for rapid local prototyping only. Always use `generate` + `migrate` for production-like environments.
- **Deprecated index syntax:** The old `(table) => ({ ... })` object-return style for indexes is deprecated. Use the array callback `(table) => [...]` instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration diffing | Manual SQL migration files | `drizzle-kit generate` | Drizzle compares schema snapshots and produces accurate DDL diffs; hand-written migrations drift easily |
| Connection pooling | New `Client` per query | `pg.Pool` | Battle-tested pooling, error handling, and graceful shutdown |
| Schema type sharing | Copy-pasting types across packages | Export `schema` namespace from `packages/db` | Keeps types in sync; Drizzle's query builder relies on the schema object for relational queries |
| Environment loading | Custom `.env` parser in every package | `dotenv/config` or shell injection before script execution | Standard, well-tested, and avoids duplicating env logic |

**Key insight:** Drizzle's value is in its type-safe query builder and migration tooling. Hand-rolling SQL migrations defeats the purpose and introduces drift between the TypeScript schema and the actual database state.

---

## Common Pitfalls

### Pitfall 1: Missing `meta/` Directory or `_journal.json`
**What goes wrong:** `drizzle-kit generate` crashes with `ENOENT: no such file or directory, open '.../meta/_journal.json'`.
**Why it happens:** The `meta/` folder is generated alongside migrations, but if it is accidentally gitignored or deleted, Drizzle cannot compute the next diff.
**How to avoid:** Commit the entire `drizzle/` directory, including `meta/`, to version control.
**Warning signs:** First `generate` after cloning fails despite the database being empty.

### Pitfall 2: `pg` vs `node-postgres` Import Confusion in Drizzle
**What goes wrong:** Using `import { drizzle } from 'drizzle-orm/postgres-js'` while the project installs `pg`, or vice versa, causes runtime errors or type mismatches.
**Why it happens:** Drizzle has separate entrypoints for each driver (`drizzle-orm/node-postgres`, `drizzle-orm/postgres-js`, `drizzle-orm/neon-http`, etc.).
**How to avoid:** Match the Drizzle import to the installed driver. If using `pg`, import from `drizzle-orm/node-postgres`.
**Warning signs:** Type errors on `drizzle(pool)` or missing method errors at runtime.

### Pitfall 3: Composite Index Direction Matters
**What goes wrong:** A composite index on `(project_id, date)` does not help a query that filters only on `date` without `project_id`.
**Why it happens:** PostgreSQL b-tree composite indexes are left-to-right prefix matches.
**How to avoid:** Order columns in the index by the most restrictive, most commonly filtered column first. Here, `project_id` is the partition key and should come first, matching D-IX-01/02/03.
**Warning signs:** Queries that should use the index fall back to sequential scans.

### Pitfall 4: pgAdmin Server Registration Requires Manual Steps
**What goes wrong:** After `docker compose up`, developers open pgAdmin and do not know how to connect to the `postgres` container.
**Why it happens:** pgAdmin stores server configurations in its own volume, not in the container image. By default, no servers are pre-registered.
**How to avoid:** Document the exact connection properties (Host: `postgres`, Port: `5432`, Username: `postgres`, Password: from `.env`). Optionally, use a `servers.json` bind mount to auto-register the server on first start.
**Warning signs:** Developers ask "what is the database password?" repeatedly.

---

## Code Examples

### Composite Index (Modern Syntax)
```typescript
// Source: https://mintlify.com/drizzle-team/drizzle-orm/schema/indexes
import { pgTable, integer, date, index } from 'drizzle-orm/pg-core';

export const dailyStats = pgTable('daily_stats', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  contributor: varchar('contributor', { length: 255 }).notNull(),
  commits: integer('commits').notNull().default(0),
  insertions: integer('insertions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
}, (table) => [
  index('daily_stats_project_date_idx').on(table.projectId, table.date),
]);
```

### Docker Compose (PostgreSQL + pgAdmin)
```yaml
# Source: https://belowthemalt.com/2021/06/09/run-postgresql-and-pgadmin-in-docker-for-local-development-using-docker-compose/
services:
  postgres:
    image: postgres:16
    container_name: river_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: river
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: river_pgadmin
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@localhost.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    volumes:
      - pgadmin_data:/var/lib/pgadmin

volumes:
  postgres_data:
  pgadmin_data:
```

### Root `.env` Template
```bash
# Source: project conventions (D-05, D-06)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/river
```

### pnpm Scripts in `packages/db/package.json`
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Foreign Key with Cascade
```typescript
// Source: Drizzle ORM relations docs / community best practices
import { pgTable, integer, varchar, index } from 'drizzle-orm/pg-core';
import { projects } from './core';

export const commitFiles = pgTable('commit_files', {
  id: serial('id').primaryKey(),
  commitId: integer('commit_id')
    .notNull()
    .references(() => commits.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  insertions: integer('insertions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
}, (table) => [
  index('commit_files_commit_idx').on(table.commitId),
]);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `(table) => ({ idx: index(...).on(...) })` object-return for indexes | `(table) => [index(...).on(...)]` array callback | 2024 (Drizzle 0.30+) | Deprecated object style still works but array callback is the documented, future-proof pattern |
| `drizzle-kit push` for schema changes in all envs | `push` for dev only; `generate` + `migrate` for prod/CI | 2024 | Prevents accidental destructive changes in production |
| Per-table schema files or monolithic `schema.ts` | Domain-grouped files (core, stats, auth, etc.) | 2024+ monorepo trend | Easier navigation and ownership in team settings |

**Deprecated/outdated:**
- `drizzle-orm/pg-table` import paths: use `drizzle-orm/pg-core` exclusively.
- `bigint` mode `'number'` for IDs: use `serial` or `integer` with `generatedAlwaysAsIdentity` instead for PostgreSQL auto-increment behavior.

---

## Open Questions

1. **Should we use `postgres.js` instead of `pg`?**
   - What we know: `postgres.js` is ~10-30% faster on Bun and has zero native dependencies. `pg` is more mature for streaming and has broader ecosystem support.
   - What's unclear: Whether the pipeline package will eventually need heavy streaming or COPY operations.
   - Recommendation: Start with `pg` for compatibility. Switching to `postgres.js` later requires only changing `client.ts` and the Drizzle import; the schema remains identical.

2. **Should we add a seed script for testing?**
   - What we know: The user deferred this to Claude's discretion.
   - What's unclear: Whether Phase 3/4 testing will benefit from pre-seeded data.
   - Recommendation: Skip the seed script in Phase 2 to stay focused on schema and migrations. Add one later if pipeline testing requires it.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | PostgreSQL container | Yes | 29.2.1 | — |
| Docker Compose | PostgreSQL + pgAdmin orchestration | Yes | v2.34.0 (bundled) | — |
| Node.js | Drizzle Kit CLI, `pg` driver | Yes | v22.22.1 | Bun 1.3.10 (locked decision) |
| pnpm | Workspace scripts, package install | Yes | 10.33.0 | — |
| PostgreSQL (local) | Database for migrations | No (will be created by docker-compose) | — | — |

**Missing dependencies with no fallback:**
- None. All tooling required to execute this phase is available.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

> Included because `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **vitest** v3.x (already installed at root) |
| Config file | `vitest.config.ts` at root (not yet created) or package-level config |
| Quick run command | `pnpm test` (runs `vitest run` from root) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | Schema declarations produce valid SQL matching decided table shapes | integration (generate) | `cd packages/db && pnpm db:generate` exits 0 and creates `.sql` | ❌ Wave 0 |
| DB-02 | Drizzle config resolves, client connects, and migrations table is created | smoke | `cd packages/db && DATABASE_URL=... pnpm db:migrate` exits 0 | ❌ Wave 0 |
| DB-03 | docker-compose brings up PostgreSQL and pgAdmin; migrations apply cleanly | end-to-end | `docker compose up -d && pnpm db:migrate` succeeds | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/db && pnpm db:generate && pnpm db:migrate`
- **Per wave merge:** Full phase smoke test (`docker compose up -d` + `pnpm db:migrate` + verify tables exist)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/db/` directory and `package.json` — does not exist yet
- [ ] `packages/db/drizzle.config.ts` — Drizzle kit configuration
- [ ] `packages/db/src/schema/{core,stats,index}.ts` — schema source files
- [ ] `packages/db/src/client.ts` — database client initialization
- [ ] `docker-compose.yml` (or `docker-compose.dev.yml`) at repo root
- [ ] `.env` at repo root with `DATABASE_URL`
- [ ] Root-level `pnpm` script or filter script to invoke `db:migrate`

*(None of these exist because this is a greenfield Phase 2.)*

---

## Sources

### Primary (HIGH confidence)
- `npm view drizzle-orm version` / `npm view drizzle-kit version` / `npm view pg version` — verified current package versions (0.45.2, 0.31.10, 8.20.0)
- `npm view drizzle-orm --json` peerDependencies — confirms `pg >= 8` and `postgres >= 3` are supported peer dependencies
- Local project inspection (`pnpm-workspace.yaml`, `apps/web/package.json`, `apps/web/nuxt.config.ts`) — confirms Phase 1 infrastructure is in place and SPA mode is active

### Secondary (MEDIUM confidence)
- [Migrations - BE Monorepo](https://mintlify.com/rifandani/be-monorepo/database/migrations) — monorepo migration best practices
- [Zenn: Practical Guide to Managing Drizzle ORM in a Shared Monorepo Package](https://zenn.dev/azuma317/articles/drizzle-supabase-rls-monorepo?locale=en) — centralized schema package patterns
- [Drizzle ORM indexes docs (Mintlify)](https://mintlify.com/drizzle-team/drizzle-orm/schema/indexes) — modern composite index syntax
- [GitHub Discussion #3324](https://github.com/drizzle-team/drizzle-orm/discussions/3324) — deprecation of object-return index syntax

### Tertiary (LOW confidence)
- Web search consensus on `pg` vs `postgres.js` performance for Bun/Node 2025 — no official benchmark link retrieved; marked for validation if performance becomes a blocker

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — versions verified from npm registry; Drizzle + pg is a well-trodden path
- Architecture: **HIGH** — monorepo db-package pattern is widely documented and matches existing pnpm workspace structure
- Pitfalls: **HIGH** — `meta/` issues and driver import mismatches are frequently reported and well understood

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (Drizzle is actively maintained; re-verify versions if planning is delayed)
