# Testing Patterns & Code Quality

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:**
- Vitest 3.0.0
- Config files:
  - `apps/web/vitest.config.ts` (alias resolution for `~/` and `@project-river/db/*`)
  - `packages/pipeline/vitest.config.ts` (absolute path aliases for `@project-river/db`)
- Root test command: `pnpm test` (resolves via root `package.json` to `vitest run`)

**Assertion Library:**
- Vitest built-in `expect`
- Matchers used: `toBe`, `toEqual`, `toHaveLength`, `toContain`, `toMatchObject`, `toThrow`, `rejects.toThrow`, `rejects.toMatchObject`

**Run Commands:**
```bash
pnpm test                              # Run all tests
pnpm --filter @project-river/web test  # Web package only
pnpm --filter @project-river/pipeline test  # Pipeline package only
```

## Test File Organization

**Location:**
- `*.test.ts` alongside source files in `packages/pipeline/tests/`
- `*.test.ts` under `apps/web/test/` mirroring `app/` structure

**Naming:**
- Unit tests: `{module}.test.ts` (e.g., `parser.test.ts`, `d3Helpers.test.ts`)
- Integration tests: embedded within the same file, gated by `describe.sequential` or `beforeAll` environment checks

**Structure:**
```
apps/web/
  app/composables/useContributorColors.ts
  test/composables/useContributorColors.test.ts
  app/utils/d3Helpers.ts
  test/utils/d3Helpers.test.ts
  server/api/projects/[id]/daily.get.ts
  server/api/projects/[id]/daily.get.test.ts

packages/pipeline/
  src/parser.ts
  tests/parser.test.ts
  src/db/analyze.ts
  tests/analyze.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

describe('moduleName', () => {
  it('should handle valid input', () => {
    // arrange
    // act
    // assert
  })

  it('should throw on invalid input', () => {
    expect(() => fn(null)).toThrow('message')
  })
})
```

**Patterns:**
- `beforeAll` / `afterAll` for expensive DB setup and teardown
- `describe.sequential` for DB mutation tests that must not run in parallel
- Tests skip gracefully when `DATABASE_URL` is absent (`if (!hasDb) return` or `it.skip`)

## Mocking

**Framework:**
- Vitest built-in `vi`
- Module-level mocking via `vi.mock()` at top of test file
- Global prototype patches for browser APIs (`URL.createObjectURL`, `HTMLAnchorElement.prototype.click`)

**Patterns:**
```typescript
// Intercept a module import to avoid live DB connections
vi.mock('../src/db/analyze.ts', () => ({
  analyzeRepo: vi.fn()
}))

// Mock DOM globals in jsdom tests
const createObjectURL = vi.fn(() => 'blob:test')
URL.createObjectURL = createObjectURL
```

**What to Mock:**
- DB-dependent imports in CLI tests (`vi.doMock` used in `cli.test.ts`)
- Browser APIs (`URL.createObjectURL`, `URL.revokeObjectURL`) in SVG export tests
- `HTMLAnchorElement.prototype.click` for download trigger tests

**What NOT to Mock:**
- Pure utilities (`d3Helpers.ts`, `calcDay.ts`) are tested directly
- Internal data structures (`ParsedCommit`, `DailyStat`)

## Fixtures and Factories

**Test Data:**
- Inline literal objects for simple cases
- Temporary Git repositories created via `mkdtempSync` + `git init` for parser and analyzer integration tests
- DB seed data inserted in `beforeAll`, cleaned in `afterAll`

**Location:**
- Factory helpers not yet extracted; currently inline in test files
- Temp directories created with `node:ostmpdir()` prefixes (`river-analyze-test-*`, `river-pipeline-test-*`)

## Coverage

**Requirements:**
- No enforced coverage target
- Focus on correctness of parsers, aggregations, and API contracts

**Configuration:**
- Built-in Vitest coverage available via `--coverage` flag (not currently wired to CI)

## Test Types

**Unit Tests:**
- Scope: Single function in isolation
- Examples:
  - `calcDay.test.ts` — pure aggregation logic
  - `d3Helpers.test.ts` — pivot and stack helpers
  - `useContributorColors.test.ts` — deterministic HSL generation

**Integration Tests:**
- Scope: Full CLI flow or API route with real (or mocked) dependencies
- Examples:
  - `parser.test.ts` — spins up real Git repos, validates `.mailmap` resolution
  - `analyze.test.ts` — requires live PostgreSQL; tests force/incremental modes
  - `daily.get.test.ts` / `monthly.get.test.ts` — construct `h3` events and hit DB

**E2E Tests:**
- Not currently used

## Code Quality Standards

**Linting:**
- `@antfu/eslint-config` v4 with `vue: true`, `typescript: true`, `formatters: true`, `test: true`
- No Prettier; formatting handled by ESLint (`eslint-plugin-format`)
- Pre-commit hook (`lint-staged`) runs `eslint --fix` on staged `*.{js,ts,mjs,cjs,vue,json,md}`

**TypeScript:**
- Strict mode enabled across packages
- Explicit return types on exported functions
- Type-only imports used where appropriate (`import type { ... }`)

**Patterns Enforced by Linter:**
- Consistent quote style
- Trailing commas
- No unused variables
- Import organization

## Common Patterns

**Async Testing:**
```typescript
it('handles async generator', async () => {
  const results = await collect(parseLogStream(lines()))
  expect(results).toHaveLength(2)
})
```

**Error Testing:**
```typescript
it('rejects invalid input', async () => {
  await expect(handler(createMockEvent({ id: 'abc' })))
    .rejects.toMatchObject({ statusCode: 400 })
})
```

**Environment-Gated DB Tests:**
```typescript
const hasDb = !!process.env.DATABASE_URL
describe.sequential('db integration', () => {
  const testOrSkip = hasDb ? it : it.skip
  testOrSkip('returns rows', async () => { /* ... */ })
})
```

---

*Testing & quality analysis: 2026-04-09*
*Update when test patterns or lint config changes*
