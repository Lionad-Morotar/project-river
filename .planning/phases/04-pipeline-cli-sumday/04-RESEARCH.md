# Phase 4: Pipeline CLI & sumDay - Research

**Researched:** 2026-04-09
**Domain:** Bun CLI, Drizzle ORM batch inserts, PostgreSQL window functions
**Confidence:** HIGH

## Summary

Phase 4 connects the streaming Git parser (Phase 3) to the PostgreSQL schema (Phase 2) via a Bun-based CLI entrypoint. The core technical challenge is safely persisting large datasets in chunked transactions while computing rolling cumulative statistics entirely in SQL.

The standard approach for this stack is straightforward: use `node:util.parseArgs` for CLI flags, Drizzle ORM's `.values(array)` for batch inserts (with client-side chunking to avoid stack overflow and PostgreSQL parameter limits), and PostgreSQL window functions (`SUM(...) OVER (PARTITION BY ... ORDER BY ...)`) for cumulative sums. Bun runs TypeScript natively, so the CLI can be distributed as a `.ts` file with a `#!/usr/bin/env bun` shebang and a `package.json` `bin` entry.

**Primary recommendation:** Build the `analyze` command in `packages/pipeline/src/cli.ts`, wrap each month-boundary batch in a `db.transaction()`, chunk inserts to stay under ~2,000 rows per statement, and compute `sum_day` with a single PostgreSQL CTE using window functions after all `daily_stats` are committed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The CLI command is `analyze <repo-path> [project-name]`.
- **D-02:** Additional flags: `--batch-size`, `--force`, and `--incremental`.
- **D-03:** If `project-name` is omitted, derive it automatically from the repo path's basename.
- **D-04:** Chunk writes by **calendar month**. All commits within a given month are grouped into a single batch and written within one transaction.
- **D-05:** This implies the streaming parser must track month boundaries and trigger a database write + memory flush at each boundary.
- **D-06:** Compute `sum_day` (rolling cumulative daily statistics) entirely inside PostgreSQL using SQL — specifically CTEs and window functions.
- **D-07:** Do NOT compute sumDay in the TS/Bun application layer. After `daily_stats` are committed, run a single SQL generation query to populate `sum_day`.
- **D-08:** Default behavior when re-analyzing the same repository path: **reject** (warn and exit unless an explicit flag is provided).
- **D-09:** `--force` triggers a full overwrite: delete existing project records (`commits`, `commit_files`, `daily_stats`, `sum_day`) and re-analyze from scratch.
- **D-10:** `--incremental` appends only new commits, skipping already-parsed SHAs.
- **D-11:** If a single calendar month contains more than 10,000 commits, the pipeline further subdivides that month into smaller sub-batches (still within the same transaction) to prevent unbounded memory growth and WAL bloat.

### Claude's Discretion
- Exact default value for `--batch-size`.
- SQL query shape for sumDay generation (single bulk CTE vs partitioned by project).
- How SHA deduplication is tracked for `--incremental` (index lookup, in-memory bloom filter, etc.).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 4 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-03 | Implement `sumDay` algorithm to compute rolling cumulative statistics from daily stats | Compute entirely in PostgreSQL with `SUM(...) OVER (PARTITION BY contributor ORDER BY date)` window function after `daily_stats` are committed |
| PIPE-04 | Build CLI entrypoint (`analyze`) that parses a repo and writes to PostgreSQL in chunked batches | Use `node:util.parseArgs` for CLI flags; persist via Drizzle `.values(array)` inside `db.transaction()` with month-boundary chunking |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.2 (installed) | Type-safe SQL builder and batch insert | Already installed in `packages/db`; compiles to near-raw SQL |
| `pg` | 8.20.0 (installed) | PostgreSQL driver for Node/Bun | Locked by Phase 2; works with Drizzle `node-postgres` dialect |
| `node:util` | Built-in (Node v22 / Bun 1.3) | CLI argument parsing via `parseArgs` | Zero-dependency, standard API, fully supported in Bun |
| `node:child_process` | Built-in | Spawn `git log --numstat` stream | Already used by Phase 3 parser |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 3.2.4 (installed) | Unit/integration testing for pipeline | Already configured and passing in `packages/pipeline` |

**Installation:** Already present. No new dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
packages/pipeline/
├── src/
│   ├── cli.ts          # analyze entrypoint, argv parsing, orchestration
│   ├── parser.ts       # (existing) streaming git log parser
│   ├── calcDay.ts      # (existing) daily contributor aggregation
│   ├── types.ts        # (existing) shared types
│   └── db/
│       ├── analyze.ts  # high-level analyzeRepo(projectName, repoPath) helper
│       └── sumDay.ts   # SQL query builder for cumulative stats
├── tests/
│   ├── parser.test.ts  # (existing)
│   ├── calcDay.test.ts # (existing)
│   ├── cli.test.ts     # CLI flag parsing & entrypoint behavior
│   └── analyze.test.ts # integration tests for DB persistence
└── package.json        # bin: { "analyze": "./src/cli.ts" }
```

### Pattern 1: Month-Boundary Chunked Persistence
**What:** The streaming parser yields commits chronologically. The CLI buffers commits into memory until the committer date crosses into a new calendar month. At that boundary, it:
1. Runs `calcDay` on the buffered month
2. Inserts `commits`, `commit_files`, and `daily_stats` within a single `db.transaction()`
3. Flushes the buffer and continues
**When to use:** Mandatory per D-04. Essential for large repos (Linux kernel, Chromium) where loading all commits into memory would OOM.

### Pattern 2: Sub-Batch Safety Valve
**What:** If a single month exceeds 10,000 commits, split the insert into smaller `.values()` chunks (e.g., 2,000 rows) but keep them inside the same transaction.
**When to use:** Required per D-11. Prevents Drizzle call-stack overflow and PostgreSQL parameter-limit errors.

### Pattern 3: In-Database sumDay via CTE
**What:** After all months are processed, run a single SQL statement that:
1. Deletes existing `sum_day` rows for the project
2. Computes cumulative sums with window functions over `daily_stats`
3. Inserts the results into `sum_day`
**When to use:** Required per D-06/D-07. Keeps application logic minimal and leverages PostgreSQL's optimized window-function execution.

**Example:**
```sql
-- Source: PostgreSQL window function best practices + Phase 2 schema
WITH daily AS (
  SELECT
    project_id,
    date,
    contributor,
    commits,
    insertions,
    deletions
  FROM daily_stats
  WHERE project_id = $1
),
cumulative AS (
  SELECT
    project_id,
    date,
    contributor,
    SUM(commits) OVER (
      PARTITION BY contributor
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_commits,
    SUM(insertions) OVER (
      PARTITION BY contributor
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_insertions,
    SUM(deletions) OVER (
      PARTITION BY contributor
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_deletions
  FROM daily
)
INSERT INTO sum_day (
  project_id, date, contributor,
  cumulative_commits, cumulative_insertions, cumulative_deletions
)
SELECT * FROM cumulative;
```

### Anti-Patterns to Avoid
- **Streaming month-by-month but inserting row-by-row:** This creates N round trips and negates the benefit of batching. Always use `.values(array)`.
- **Computing sumDay in TypeScript/Bun:** This pulls the entire `daily_stats` table into memory, sorts it, and iterates. It violates D-07 and is orders of magnitude slower than PostgreSQL window functions.
- **Holding the transaction open across git log parsing:** `git log` can take minutes for large repos. A long-running transaction holds locks and bloats the WAL. Commit at each month boundary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI flag parsing | Custom regex on `process.argv` | `node:util.parseArgs` | Built-in, supports booleans/strings/positionals, validates unknown flags |
| SQL transaction wrapping | Raw `BEGIN` / `COMMIT` strings | `drizzle-orm`'s `db.transaction()` | Type-safe, handles rollback on error, driver-agnostic |
| Cumulative sum algorithm | Custom reduce/sort in TS | PostgreSQL `SUM() OVER (...)` | O(n log n) sort + scan in DB is faster and memory-safe for large time series |
| Batch size chunking | Fixed 5,000 rows for all tables | Dynamic chunking based on table column count | PostgreSQL has 32,767 param limit; SQLite has 999. Column count changes the safe row count. |

**Key insight:** In this domain, the database is better at both persistence (ACID transactions) and analytics (window functions) than application-layer code. The CLI's job is orchestration, not computation.

## Runtime State Inventory

> Trigger assessment: This phase involves new CLI entrypoint and persistence logic, but no rename/refactor/migration of existing runtime entities.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | PostgreSQL `river_postgres` container running at `:5432` with existing schema from Phase 2. No projects/commits exist yet. | None — greenfield for Phase 4 data. |
| Live service config | None | — |
| OS-registered state | None — `analyze` CLI is not yet installed globally | — |
| Secrets/env vars | Root `.env` missing from repo (not in git). `DATABASE_URL` is required for `drizzle-kit migrate` and runtime DB connection. | Development bootstrap: create `.env` before testing. Code should not embed fallback credentials. |
| Build artifacts | None stale from prior phases | — |

**Nothing found in category:**
- Live service config: None — verified no n8n/Datadog/etc. integrations exist.
- OS-registered state: None — verified no systemd/launchd/Task Scheduler registrations.

## Common Pitfalls

### Pitfall 1: Drizzle `.values(array)` Stack Overflow
**What goes wrong:** Passing >10,000 rows to `.values()` can trigger `RangeError: Maximum call stack size exceeded` due to recursive query building.
**Why it happens:** Drizzle ORM v0.45.2 builds the parameterized query recursively; very deep arrays exceed the JS call stack.
**How to avoid:** Chunk inserts to ~2,000 rows per call. Per D-11, if a month has >10,000 commits, subdivide into sub-batches within the same transaction.
**Warning signs:** Test with a large repo (e.g., `torvalds/linux`). If the process crashes mid-insert with a stack trace in `buildQueryFromSourceParams`, chunk size is too large.

### Pitfall 2: PostgreSQL Parameter Limit
**What goes wrong:** A single `INSERT` with too many values hits the 32,767 parameter limit.
**Why it happens:** Each column value becomes a bound parameter. A 10-column table maxes out at ~3,200 rows per statement.
**How to avoid:** Calculate safe chunk size as `Math.floor(32767 / columnCount)`. For `commits` (~6 columns), the limit is ~5,000 rows. For `commit_files` (~4 columns), ~8,000 rows. The 2,000-row safety chunk handles all tables comfortably.
**Warning signs:** Error `bind message has 32768 parameter formats but 0 parameters`.

### Pitfall 3: WAL Bloat from Long Transactions
**What goes wrong:** Wrapping the entire repo parse in one transaction causes PostgreSQL to retain WAL segments and hold locks for minutes.
**Why it happens:** PostgreSQL cannot vacuum or truncate WAL until the oldest active transaction completes.
**How to avoid:** Commit at each calendar-month boundary (D-04). Do not open a transaction before spawning `git log`.
**Warning signs:** Disk usage grows during `analyze` and drops only after completion; `pg_stat_activity` shows a long-running `idle in transaction` state.

### Pitfall 4: Incremental SHA Deduplication Fails on Large Inputs
**What goes wrong:** `--incremental` loads all existing SHAs into memory, causing OOM for repos with millions of commits.
**Why it happens:** A naive `Set<string>` of all hashes can consume hundreds of MBs.
**How to avoid:** Use a database-level existence check (e.g., `SELECT hash FROM commits WHERE project_id = $1`) or an in-memory Bloom filter for probabilistic deduplication. Since D-10 is Claude's discretion, the recommended default is a Bloom filter (space-efficient) with a DB fallback for verification.
**Warning signs:** RSS memory grows linearly with repo size during `--incremental` runs.

## Code Examples

### CLI Argument Parsing with `node:util.parseArgs`
```typescript
// Source: Bun official docs + Node.js API reference
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'batch-size': { type: 'string', default: '2000' },
    force: { type: 'boolean', default: false },
    incremental: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: true,
})

const [repoPath, projectName] = positionals
const batchSize = Number.parseInt(values['batch-size'] as string, 10)
const force = values.force as boolean
const incremental = values.incremental as boolean
```

### Drizzle Chunked Insert Inside a Transaction
```typescript
// Source: Drizzle ORM docs + GitHub issue #797 workaround
import { db } from '@project-river/db'
import { commits, commitFiles } from '@project-river/db/schema'

async function insertCommitsChunked(
  parsedCommits: ParsedCommit[],
  projectId: number,
) {
  const CHUNK_SIZE = 2000

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsedCommits.length; i += CHUNK_SIZE) {
      const chunk = parsedCommits.slice(i, i + CHUNK_SIZE)

      const commitRows = chunk.map(c => ({
        projectId,
        hash: c.hash,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        committerDate: c.committerDate,
        message: c.message,
      }))

      const inserted = await tx.insert(commits).values(commitRows).returning({ id: commits.id })

      const fileRows = chunk.flatMap((c, idx) =>
        c.files.map(f => ({
          commitId: inserted[idx].id,
          path: f.path,
          insertions: f.insertions,
          deletions: f.deletions,
        }))
      )

      if (fileRows.length > 0) {
        for (let j = 0; j < fileRows.length; j += CHUNK_SIZE) {
          await tx.insert(commitFiles).values(fileRows.slice(j, j + CHUNK_SIZE))
        }
      }
    }
  })
}
```

### sumDay SQL with Window Functions
```sql
-- Source: PostgreSQL window function documentation patterns
DELETE FROM sum_day WHERE project_id = $1;

WITH daily AS (
  SELECT project_id, date, contributor, commits, insertions, deletions
  FROM daily_stats
  WHERE project_id = $1
),
cumulative AS (
  SELECT
    project_id,
    date,
    contributor,
    SUM(commits) OVER (
      PARTITION BY contributor
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_commits,
    SUM(insertions) OVER (
      PARTITION BY contributor
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_insertions,
    SUM(deletions) OVER (
      PARTITION BY contributor
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_deletions
  FROM daily
)
INSERT INTO sum_day (
  project_id, date, contributor,
  cumulative_commits, cumulative_insertions, cumulative_deletions
)
SELECT * FROM cumulative;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom argv parsers (minimist, yargs) | `node:util.parseArgs` (Node 18+) | 2022+ | Zero dep, built-in validation |
| Application-layer cumulative sums | PostgreSQL window functions | Always standard | Massive memory and latency reduction |
| Row-by-row ORM inserts | `.values(array)` batching | Drizzle v0.30+ | 3-4x faster than Prisma `createMany` |

**Deprecated/outdated:**
- `process.argv` manual slicing: Replaced by `parseArgs` for flag types and error handling.

## Open Questions

1. **Default `--batch-size` value:**
   - What we know: A 2,000 row chunk is safely under the Drizzle stack-overflow threshold and the PostgreSQL 32,767 parameter limit for all tables in this schema.
   - What's unclear: Whether 2,000 is optimal for the target machine's memory/PostgreSQL tuning.
   - Recommendation: Default to `2000`. Allow override via `--batch-size`.

2. **Incremental SHA deduplication strategy:**
   - What we know: `--incremental` must skip already-parsed SHAs.
   - What's unclear: Whether to use a Bloom filter, a DB `EXISTS` check per commit, or a hybrid.
   - Recommendation: Use a Bloom filter for the fast path (probabilistic, ~1% false positive with 8 bits per element). On a positive Bloom hit, query `commits` table by `hash` to confirm existence. This keeps memory bounded to ~1MB per million SHAs.

3. **sumDay query scope:**
   - What we know: Must be computed after `daily_stats` are fully committed.
   - What's unclear: Whether to partition the CTE by project or run a global query with `WHERE project_id = $1`.
   - Recommendation: Use `WHERE project_id = $1` inside the CTE. It is simpler, leverages the composite index on `daily_stats(project_id, date)`, and avoids cross-project window scans.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | CLI runtime | ✓ | 1.3.10 | Node v22.22.1 (compat mode) |
| Node | Dev tooling, `parseArgs` | ✓ | v22.22.1 | — |
| pnpm | Workspace scripts | ✓ | 10.33.0 | — |
| PostgreSQL | Data persistence | ✓ | Container `river_postgres` at `:5432` | — |
| Docker | Local DB | ✓ | 29.2.1 | — |
| Vitest | Tests | ✓ | 3.2.4 | — |
| Root `.env` | DB connection string | ✗ | — | Manual creation required before running |

**Missing dependencies with no fallback:**
- Root `.env` file: `DATABASE_URL` is undefined. This blocks `drizzle-kit migrate` and runtime DB connections. The planner should include a `.env` bootstrap task.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | None in `packages/pipeline` (uses defaults) |
| Quick run command | `pnpm --filter @project-river/pipeline test` |
| Full suite command | `pnpm test` (runs from root via vitest) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PIPE-03 | sumDay computes correct cumulative stats after daily_stats insertion | unit/integration | `pnpm --filter @project-river/pipeline test` | ❌ (needs `sumDay.test.ts`) |
| PIPE-04 | analyze CLI writes commits and daily_stats to DB in chunks | integration | `pnpm --filter @project-river/pipeline test` | ❌ (needs `analyze.test.ts` + `cli.test.ts`) |
| PIPE-04 | Large repo chunked batch processing avoids memory issues | integration/smoke | manual with `torvalds/linux` clone | ❌ manual-only |

### Sampling Rate
- **Per task commit:** `pnpm --filter @project-river/pipeline test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/pipeline/tests/sumDay.test.ts` — covers PIPE-03 SQL correctness
- [ ] `packages/pipeline/tests/cli.test.ts` — covers PIPE-04 CLI argument parsing and entrypoint behavior
- [ ] `packages/pipeline/tests/analyze.test.ts` — covers PIPE-04 end-to-end DB persistence logic
- [ ] Root `.env` — required for integration tests that hit PostgreSQL

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM Performance Docs](https://mintlify.com/drizzle-team/drizzle-orm/advanced/performance) — batch insert best practices
- [Drizzle ORM Best Practices](https://mintlify.com/drizzle-team/drizzle-orm/guides/best-practices) — `.values(array)` vs row-by-row
- [Bun `parseArgs` Guide](https://bun.com/docs/guides/process/argv) — CLI argument parsing patterns
- [Bun `util.parseArgs` API Reference](https://bun.com/reference/node/util/parseArgs) — official API coverage
- [PostgreSQL Cumulative Sum — PopSQL](https://popsql.com/learn-sql/postgresql/how-to-calculate-cumulative-sum-running-total-in-postgresql) — window function syntax

### Secondary (MEDIUM confidence)
- [GitHub Issue #797](https://github.com/drizzle-team/drizzle-orm/issues/797) — `RangeError` on large `.values()` arrays
- [GitHub Issue #2983](https://github.com/drizzle-team/drizzle-orm/issues/2983) — default column bloat in bulk inserts
- [Juejin benchmark (2025)](https://juejin.cn/post/7518985912190500915) — Drizzle vs Prisma performance numbers
- [Drizzle vs TypeORM comparison (2025)](https://generalistprogrammer.com/comparisons/drizzle-vs-typeorm) — ecosystem speed validation
- [MCPMarket SQL Batching Skill](https://mcpmarket.com/tools/skills/sql-batching) — SQLite/D1 999 variable limit and chunking patterns

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all libraries are installed, versions verified, and official docs confirm capabilities.
- Architecture: **HIGH** — month-boundary chunking and window-function sumDay are well-documented SQL patterns explicitly chosen in CONTEXT.md.
- Pitfalls: **HIGH** — Drizzle stack overflow and PostgreSQL parameter limits are verified by official docs and GitHub issues.

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack)
