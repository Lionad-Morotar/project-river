# Smart Docs: packages/pipeline

CLI-driven data pipeline for **project-river**. Parses Git history from a local repository, computes daily contributor statistics, accumulates running totals, and persists everything to PostgreSQL.

---

## Technology Stack

- **Runtime**: Bun / Node v22 (shebang targets `bun`)
- **Language**: TypeScript (ES modules)
- **ORM**: Drizzle ORM for DB writes
- **Process spawning**: `node:child_process` (`git log --numstat`)
- **Testing**: Vitest

---

## Entry Points

| File | Export / Role |
|------|---------------|
| `src/index.ts` | Barrel export of public API (`calcDay`, `analyzeRepo`, `generateSumDay`, `parseRepo`, types) |
| `src/cli.ts` | CLI entry (`analyze` bin) — argument parsing and `analyzeRepo` invocation |
| `src/parser.ts` | `parseRepo(repoPath)` and `parseLogStream(lines)` |
| `src/calcDay.ts` | `calcDay(commits)` — daily aggregation logic |
| `src/db/analyze.ts` | `analyzeRepo()` — end-to-end ingestion orchestrator |
| `src/db/sumDay.ts` | `generateSumDay(projectId)` — cumulative window-function generation |
| `src/types.ts` | Core TypeScript interfaces |

---

## Core Types (`src/types.ts`)

```ts
interface FileChange {
  path: string
  insertions: number
  deletions: number
}

interface ParsedCommit {
  hash: string
  authorName: string
  authorEmail: string
  committerDate: Date
  message: string
  files: FileChange[]
}
```

---

## Parser (`src/parser.ts`)

### `parseRepo(repoPath): AsyncGenerator<ParsedCommit>`

Spawns:

```bash
git -C <repoPath> log --no-merges --date=iso-strict --format="%H\t%aN\t%aE\t%cd\t%s" --numstat
```

- Streams stdout line-by-line via `readline`
- Header lines are detected by a tab-count heuristic (`>= 4 tabs`)
- Yields `ParsedCommit` objects as soon as a new header is encountered
- Validates `git` exit code after stream exhaustion

### `parseLogStream(lines): AsyncGenerator<ParsedCommit>`

Pure async generator over any `AsyncIterable<string>`. Enables testability without spawning a real `git` process.

---

## Daily Aggregation (`src/calcDay.ts`)

### `calcDay(commits): DailyStat[]`

Aggregates commits into per-contributor, per-UTC-day rows.

**Key behavior**
- Uses `authorEmail` as canonical contributor key
- UTC date derived from `committerDate.toISOString().slice(0, 10)`
- Deduplicates file paths per `(date, contributor)` with a `Set<string>` for accurate `filesTouched`
- Sums `insertions` and `deletions` across all files in each commit
- Returns sorted array by `(date, contributor)`

**Output type**

```ts
interface DailyStat {
  date: string        // YYYY-MM-DD
  contributor: string // authorEmail
  commits: number
  insertions: number
  deletions: number
  filesTouched: number
}
```

---

## Database Ingestion (`src/db/analyze.ts`)

### `analyzeRepo(repoPath, projectName?, options)`

End-to-end pipeline orchestrator.

**Options**
- `batchSize: number` — chunk size for batched inserts (default `2000`)
- `force: boolean` — delete existing project and re-analyze
- `incremental: boolean` — skip commits whose hash already exists

**Workflow**

1. **Project resolution**
   - Looks up `projects` by `repoPath`
   - Creates, re-creates (`force`), or reuses (`incremental`) the project record
2. **Incremental guard**
   - If `incremental`, loads existing commit hashes into a `Set<string>`
3. **Collection**
   - Eagerly collects all new commits from `parseRepo` into an in-memory array (resolves fork-worker stdout stalls in Vitest)
4. **Month-boundary flushing**
   - Walks commits in chronological order
   - Accumulates commits per `YYYY-MM` month
   - At month boundaries (or EOF), calls `flushMonth()`
5. **`flushMonth()` transaction**
   - Computes `calcDay(monthCommits)`
   - Batched inserts into `commits`, `commit_files`, and `daily_stats`
   - All within a single Drizzle transaction
6. **Cumulative generation**
   - Finally calls `generateSumDay(projectId)`

---

## Cumulative Stats (`src/db/sumDay.ts`)

### `generateSumDay(projectId): Promise<void>`

Recomputes the entire `sum_day` table for a project.

**SQL flow**
1. `DELETE FROM sum_day WHERE project_id = ?`
2. CTE `daily` — selects project's `daily_stats`
3. CTE `cumulative` — applies `SUM(...) OVER (PARTITION BY contributor ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` for commits, insertions, and deletions
4. `INSERT INTO sum_day ... SELECT * FROM cumulative`

**Note**: Split into two `db.execute` calls because `node-postgres` rejects multi-command prepared statements.

---

## CLI (`src/cli.ts`)

### `analyze <repo-path> [project-name]`

**Flags**
- `--batch-size <n>` — insert chunk size (default `2000`)
- `--force` — re-create project and re-ingest
- `--incremental` — skip already-persisted commits

**Example**

```bash
bun run ./src/cli.ts /path/to/repo my-project --incremental
```

Or via the package bin:

```bash
pnpm --filter @project-river/pipeline analyze /path/to/repo --force
```

---

## Tests

| Test file | Coverage |
|-----------|----------|
| `tests/parser.test.ts` | Header vs numstat line parsing, multi-commit streams, blank line skipping, `parseRepo` spawn integration |
| `tests/calcDay.test.ts` | Single/multi-commit days, multi-contributor aggregation, file deduplication, sorting |
| `tests/sumDay.test.ts` | Cumulative commits/insertions/deletions across multiple dates and contributors |
| `tests/analyze.test.ts` | Full `analyzeRepo` flow with fresh, force, and incremental modes (requires live PostgreSQL) |
| `tests/cli.test.ts` | Argument parsing, help/error output, `runAnalyze` entry point (uses `vi.doMock` to avoid DB dependency) |

---

## Key Design Decisions

1. **Streaming parser, eager collection**  
   `parseRepo` streams from `git log` to bound memory, but commits are collected eagerly before DB work to avoid interleaving async generators with long transactions (prevents stdout stalls in Vitest fork workers).

2. **`authorEmail` as contributor identity**  
   Consistent with `packages/db` schema and stable across name changes.

3. **Month-boundary batched transactions**  
   Breaks potentially massive ingests into manageable transactional chunks without loading the entire repo history into a single transaction.

4. **CalcDay + SumDay separation**  
   Daily aggregation is deterministic and pure; cumulative stats are a derived concern handled separately in SQL.

5. **Tab-count header heuristic**  
   Distinguishes commit header lines (`hash\tauthor\temail\tdate\tmessage`) from numstat lines without regex for simplicity and speed.

---

## Dependencies

- `drizzle-orm` — Query builder and transaction support
- `pg` — PostgreSQL driver (via `@project-river/db`)
