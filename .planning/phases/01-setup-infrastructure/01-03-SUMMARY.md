---
phase: 01-setup-infrastructure
plan: 03
subsystem: linting
tags:
  - eslint
  - husky
  - lint-staged
  - antfu
dependency_graph:
  requires:
    - 01-01
    - 01-02
  provides:
    - Root ESLint v9 flat config
    - Workspace-wide linting
    - Pre-commit hooks
  affects:
    - All workspace packages
tech-stack:
  added:
    - "@antfu/eslint-config@^4.0.0"
    - "eslint@^9.0.0"
    - "husky@^9.0.0"
    - "lint-staged@^15.0.0"
    - "vitest@^3.0.0"
    - "@vue/test-utils@^2.4.0"
    - "eslint-plugin-format@^2.0.1"
  patterns:
    - ESLint v9 flat config
    - Workspace-wide linting via pnpm -r
    - lint-staged for pre-commit linting
key-files:
  created:
    - eslint.config.mjs
    - apps/web/eslint.config.mjs
    - .husky/pre-commit
  modified:
    - package.json
    - apps/web/package.json
    - apps/web/tsconfig.json
decisions:
  - "Use antfu/eslint-config for unified ESLint + Vue + TypeScript + formatter config"
  - "Auto-install eslint-plugin-format when formatters:true enabled"
metrics:
  duration_seconds: 1200
  tasks_completed: 3
  files_created: 3
  files_modified: 3
  completed_at: "2026-04-09T01:28:47Z"
---

# Phase 01 Plan 03: Linting and Pre-commit Tooling Summary

Established linting and pre-commit tooling with antfu/eslint-config, husky, and lint-staged across the workspace.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 01-03-01 | Install and configure antfu/eslint-config at root | 1cb6dc3 | eslint.config.mjs, package.json |
| 01-03-02 | Wire ESLint into apps/web and run initial lint | 54e0bf6 | apps/web/eslint.config.mjs, apps/web/tsconfig.json, apps/web/package.json |
| 01-03-03 | Initialize husky and create pre-commit hook | 55aaf01 | .husky/pre-commit |

## Verification Results

- [x] `eslint.config.mjs` exists at root and imports `@antfu/eslint-config`
- [x] `apps/web/eslint.config.mjs` exists and references `../../eslint.config.mjs`
- [x] `pnpm lint` exits 0 with no errors
- [x] `.husky/pre-commit` exists and contains `npx lint-staged`
- [x] Root `package.json` contains `lint-staged` configuration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed incorrect relative path in apps/web/eslint.config.mjs**
- **Found during:** Task 01-03-02
- **Issue:** Plan specified `from '../eslint.config.mjs'` but this resolves to `apps/eslint.config.mjs` (wrong directory structure). Root config is at `../../eslint.config.mjs` from `apps/web/`.
- **Fix:** Changed import path to `from '../../eslint.config.mjs'`
- **Files modified:** apps/web/eslint.config.mjs
- **Commit:** 54e0bf6

**2. [Rule 1 - Bug] Fixed tsconfig.json key ordering for jsonc/sort-keys**
- **Found during:** Task 01-03-02, first `pnpm lint` run
- **Issue:** ESLint reported `jsonc/sort-keys` error: `'files' should be after 'references'`
- **Fix:** Ran `pnpm lint:fix` to auto-reorder keys
- **Files modified:** apps/web/tsconfig.json
- **Commit:** 54e0bf6

**3. [Rule 3 - Blocking] Auto-installed eslint-plugin-format**
- **Found during:** Task 01-03-02, first `pnpm lint` run
- **Issue:** antfu/eslint-config with `formatters: true` requires `eslint-plugin-format` package
- **Fix:** Allowed interactive prompt to auto-install the package
- **Files modified:** apps/web/package.json (added dependency), pnpm-lock.yaml
- **Commit:** 54e0bf6

## Known Stubs

None - no stubs detected.

## Key Decisions Made

1. **Use antfu/eslint-config for unified config** - Provides ESLint + Vue + TypeScript + formatter rules in one package, reducing config complexity
2. **Auto-install eslint-plugin-format** - Required by `formatters: true` option, installed as workspace devDependency
