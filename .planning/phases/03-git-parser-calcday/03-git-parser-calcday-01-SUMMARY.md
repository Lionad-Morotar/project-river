---
phase: 03-git-parser-calcday
plan: 01
subsystem: pipeline
tags: [git, parser, vitest, typescript, child_process]

requires:
  - phase: 02-database-schema
    provides: Monorepo workspace structure and packages directory

provides:
  - "@project-river/pipeline workspace package with package.json, tsconfig.json"
  - "Streaming git log --numstat parser with parseRepo and parseLogStream"
  - "ParsedCommit and FileChange TypeScript types"
  - "Comprehensive parser unit tests covering binary files, empty commits, mailmap, and error paths"

affects:
  - 03-git-parser-calcday
  - 04-pipeline-cli

tech-stack:
  added: []
  patterns:
    - "Line-based state machine parser with header detection via tab-count heuristic"
    - "Dual export design: parseRepo spawns git, parseLogStream accepts async iterable for testability"

key-files:
  created:
    - packages/pipeline/package.json
    - packages/pipeline/tsconfig.json
    - packages/pipeline/src/types.ts
    - packages/pipeline/src/parser.ts
    - packages/pipeline/tests/parser.test.ts
  modified:
    - packages/pipeline/src/index.ts

key-decisions:
  - "Header detection uses tab-count heuristic (>= 4 tabs) to distinguish commit headers from numstat lines, handling git's blank-line separator between header and file stats"

patterns-established:
  - "Parser module: pure TypeScript with no external dependencies, relying on node:child_process and node:readline"
  - "Test injection via parseLogStream(lines) to avoid spawning real git processes for most cases"

requirements-completed:
  - PIPE-01

# Metrics
duration: 5m
completed: 2026-04-09
---

# Phase 3 Plan 1: Parser Package Summary

**Bootstrapped `@project-river/pipeline` and implemented a robust streaming `git log --numstat` parser with 5 passing unit tests covering merge-commit exclusion, binary file handling, empty commits, `.mailmap` resolution, and invalid repo errors.**

## Performance

- **Duration:** 5m 3s
- **Started:** 2026-04-09T02:32:12Z
- **Completed:** 2026-04-09T02:37:15Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created `@project-river/pipeline` workspace package with proper ESM exports
- Implemented `parseRepo()` spawning `git log --no-merges --date=iso-strict --numstat` and streaming structured `ParsedCommit` objects
- Implemented `parseLogStream()` for test injection and decoupled consumption
- Wrote 5 comprehensive vitest unit tests verifying parsing correctness, binary files (`- -`), empty commits, `.mailmap` integration, and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Bootstrap packages/pipeline workspace package** - `418a85d` (feat)
2. **Task 2: Implement streaming Git log parser** - `a7867d9` (feat)
3. **Task 3: Write parser unit tests** - `eec29ba` (test)

## Files Created/Modified
- `packages/pipeline/package.json` - Workspace package manifest with exports for types, parser, and calcDay
- `packages/pipeline/tsconfig.json` - TypeScript config with NodeNext module resolution
- `packages/pipeline/src/types.ts` - `ParsedCommit` and `FileChange` interfaces
- `packages/pipeline/src/index.ts` - Package public re-exports
- `packages/pipeline/src/parser.ts` - Streaming parser with `parseRepo` and `parseLogStream`
- `packages/pipeline/tests/parser.test.ts` - Unit tests for all PIPE-01 edge cases

## Decisions Made
- **Header detection via tab count:** Git outputs a blank line between the format header and numstat file lines. Rather than tracking state with blank lines (which incorrectly yields early), the parser distinguishes headers from file stats by counting tabs: headers have >= 4 tabs, file stats have exactly 2. This makes the parser resilient to git's inter-commit blank line separators.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed parser state machine misidentifying blank-line separators as commit terminators**
- **Found during:** Task 2 (parser implementation verification)
- **Issue:** The original line-based state machine yielded a commit on every blank line, but `git log --numstat` outputs a blank line immediately after each header before file stats. This caused file stats to be misinterpreted as new commit headers, producing garbage `ParsedCommit` objects.
- **Fix:** Replaced blank-line termination with a tab-count heuristic: lines with >= 4 tabs are treated as headers, lines with 2 tabs as file stats. Blank lines are now ignored. Commits are yielded when a new header is encountered or at EOF.
- **Files modified:** `packages/pipeline/src/parser.ts`
- **Verification:** All 5 parser unit tests pass, including mailmap integration on a real temp repo.
- **Committed in:** `a7867d9` (Task 2 commit, corrected before tests) and `eec29ba` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** The fix was essential for parser correctness. No scope creep.

## Issues Encountered
- `git log --numstat` inserts a blank line between the `--format` header and the file statistics lines. This undocumented (in our plan) separator broke the naive state machine. Fixed by switching to header detection via tab-field count.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Parser layer is complete and tested; ready for `calcDay` aggregation in 03-02 and 03-03
- No blockers

## Self-Check: PASSED
- [x] `packages/pipeline/package.json` exists
- [x] `packages/pipeline/src/parser.ts` exists
- [x] `packages/pipeline/tests/parser.test.ts` exists
- [x] Commit `418a85d` found in git log
- [x] Commit `a7867d9` found in git log
- [x] Commit `eec29ba` found in git log

---
*Phase: 03-git-parser-calcday*
*Completed: 2026-04-09*
