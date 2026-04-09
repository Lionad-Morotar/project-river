# Smart Docs: packages/db

PostgreSQL schema and Drizzle ORM client for **project-river**. Manages projects, raw commits, file changes, and pre-aggregated daily / cumulative statistics.

---

## Technology Stack

- **ORM**: Drizzle ORM `^0.45.2` with `node-postgres` driver
- **Migration Tool**: Drizzle Kit `^0.31.10`
- **Database**: PostgreSQL 15+
- **Connection**: `pg.Pool` initialized from `DATABASE_URL`

---

## Entry Points

| File | Export | Purpose |
|------|--------|---------|
| `src/index.ts` | `db`, `pool`, `schema` | Public package surface |
| `src/client.ts` | `db`, `pool` | Drizzle + Pool singleton |
| `src/schema/index.ts` | Re-exports | Schema barrel file |
| `drizzle.config.ts` | Drizzle Kit config | Migration / studio configuration |

---

## Schema

### `core.ts`

#### `projects`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` | Primary key |
| `name` | `varchar(255)` | Display name |
| `path` | `text` | Absolute filesystem path to analyzed repo |
| `createdAt` | `timestamp` | `defaultNow()` |

#### `commits`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` | Primary key |
| `projectId` | `integer` | FK → `projects.id` (cascade) |
| `hash` | `varchar(40)` | Git commit SHA |
| `authorName` | `varchar(255)` | |
| `authorEmail` | `varchar(320)` | Used as canonical contributor identifier |
| `committerDate` | `timestamp` | Commit timestamp |
| `message` | `text` | Commit message |

**Index**: `commits_project_date_idx` on `(projectId, committerDate)`

#### `commit_files`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` | Primary key |
| `commitId` | `integer` | FK → `commits.id` (cascade) |
| `path` | `text` | Changed file path |
| `insertions` | `integer` | Default `0` |
| `deletions` | `integer` | Default `0` |

**Index**: `commit_files_commit_idx` on `(commitId)`

---

### `stats.ts`

#### `daily_stats`

Pre-aggregated per-day, per-contributor metrics derived from parsed commits.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` | Primary key |
| `projectId` | `integer` | FK → `projects.id` (cascade) |
| `date` | `date` | YYYY-MM-DD string mode |
| `contributor` | `varchar(255)` | `authorEmail` |
| `commits` | `integer` | Default `0` |
| `insertions` | `integer` | Default `0` |
| `deletions` | `integer` | Default `0` |
| `filesTouched` | `integer` | Default `0` (deduplicated per day) |

**Index**: `daily_stats_project_date_idx` on `(projectId, date)`

#### `sum_day`

Running cumulative totals per contributor generated after `daily_stats` ingestion.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` | Primary key |
| `projectId` | `integer` | FK → `projects.id` (cascade) |
| `date` | `date` | YYYY-MM-DD string mode |
| `contributor` | `varchar(255)` | |
| `cumulativeCommits` | `integer` | Default `0` |
| `cumulativeInsertions` | `integer` | Default `0` |
| `cumulativeDeletions` | `integer` | Default `0` |

**Index**: `sum_day_project_date_idx` on `(projectId, date)`

---

## Client

### `client.ts`

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
export { pool }
```

- Singleton `Pool` shared across the monorepo
- `db` is typed with the full schema object for relational query building
- Expects `DATABASE_URL` at runtime (defined at repo root `.env`)

---

## Migrations

### `drizzle.config.ts`

```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/*',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

### Scripts (in `package.json`)

| Script | Command |
|--------|---------|
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `drizzle-kit migrate` |
| `db:studio` | `drizzle-kit studio` |

**Policy**: Migrations are applied explicitly via `pnpm db:migrate`. No auto-migration on application startup.

---

## Existing Migrations

| File | Description |
|------|-------------|
| `drizzle/0000_productive_cable.sql` | Initial schema: `projects`, `commits`, `commit_files` |
| `drizzle/0001_handy_brother_voodoo.sql` | Adds `daily_stats` and `sum_day` tables with indexes |

---

## Design Decisions

1. **`authorEmail` as contributor key**  
   More stable than display names across renames and machine-generated commits.

2. **Day-level granularity**  
   Balances visual fidelity with manageable row counts for multi-year repositories.

3. **Separate `sum_day` table (materialized cumulative)**  
   Avoids expensive window-function recalculation in the web API hot path.

4. **Cascade deletes**  
   Removing a project automatically cleans all child commit, file, and stat rows.

5. **String-mode `date` columns**  
   Simplifies ISO date comparisons in TypeScript without tz conversions.

---

## Dependencies

- `drizzle-orm` — ORM query builder
- `pg` — Node Postgres driver
- `drizzle-kit` (dev) — CLI for migrations and studio
- `@types/pg` (dev) — Type definitions
