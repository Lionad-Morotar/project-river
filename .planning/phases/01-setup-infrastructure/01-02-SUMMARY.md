---
phase: 01-setup-infrastructure
plan: 02
subsystem: infra
tags: [nuxt-v4, tailwindcss-v4, nuxt-ui, vueuse, pnpm-workspace, spa]

requires:
  - phase: 01-01
    provides: pnpm workspace monorepo skeleton with apps/ and packages/ directories
provides:
  - apps/web as a Nuxt v4 minimal-template SPA
  - Tailwind CSS v4 configured via CSS-first @import
  - Nuxt UI v4 and @vueuse/nuxt registered as modules
  - Runnable build pipeline producing .output/
affects:
  - 01-03
  - UI-01
  - UI-02
  - UI-03

tech-stack:
  added:
    - nuxt ^4.4.2
    - tailwindcss ^4.2.2
    - "@nuxt/ui" ^3.1.0
    - "@vueuse/nuxt" ^13.0.0
    - typescript ^5.8.3
  patterns:
    - CSS-first Tailwind v4 via @import in a single main.css
    - Nuxt modules array for UI and composables
    - Workspace package naming with @project-river/web

key-files:
  created:
    - apps/web/app/app.vue
    - apps/web/app/assets/css/main.css
    - apps/web/nuxt.config.ts
    - apps/web/tsconfig.json
    - apps/web/.gitignore
    - apps/web/public/favicon.ico
    - apps/web/public/robots.txt
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "CSS-first Tailwind v4: use @import 'tailwindcss' in main.css instead of a JS config."
  - "SPA mode (ssr: false) selected for D3 integration simplicity."

patterns-established:
  - "apps/web package name: @project-river/web"
  - "Nuxt config extends with modules and css arrays"

requirements-completed:
  - INFRA-02

duration: 10min
completed: 2026-04-09
---

# Phase 1 Plan 02: Bootstrap Nuxt v4 SPA Summary

**Nuxt v4 SPA in apps/web with Tailwind CSS v4, Nuxt UI v4, VueUse, and a verified build pipeline.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-09T03:05:00Z
- **Completed:** 2026-04-09T03:15:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Generated Nuxt v4 minimal template into `apps/web/`
- Configured SPA mode, Nuxt UI, VueUse modules, and linked Tailwind v4 CSS
- Resolved missing `tailwindcss` dependency so `pnpm build` succeeds and produces `.output/`

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate Nuxt v4 minimal template into apps/web** - `acdb6a4` (feat)
2. **Task 2: Configure Nuxt SPA, Tailwind v4, Nuxt UI, VueUse** - `0212ed6` (feat)

**Deviation fix:** `ebab295` (fix: add missing tailwindcss devDependency)

## Files Created/Modified

- `apps/web/package.json` - Package identity @project-river/web, scripts, deps/devDeps
- `apps/web/nuxt.config.ts` - Nuxt v4 config with ssr: false, modules, css path
- `apps/web/app/app.vue` - Root Vue component from minimal template
- `apps/web/app/assets/css/main.css` - Tailwind v4 CSS-first entry
- `apps/web/tsconfig.json` - TypeScript references for Nuxt
- `apps/web/.gitignore` - Nuxt build/output ignore rules
- `apps/web/public/favicon.ico` - Favicon asset
- `apps/web/public/robots.txt` - Robots asset
- `pnpm-lock.yaml` - Workspace lockfile with added dependencies

## Decisions Made

- Followed the plan exactly for module selection and CSS-first Tailwind v4 setup.
- Retained generated `compatibilityDate` and Nuxt defaults to stay close to the official template.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing tailwindcss dependency**
- **Found during:** Task 2 (after configuring CSS and running build)
- **Issue:** `nuxt build` failed with "Can't resolve 'tailwindcss' in .../app/assets/css" because @import 'tailwindcss' requires the tailwindcss package as a direct dependency.
- **Fix:** Installed `tailwindcss ^4.2.2` into `apps/web` devDependencies via `pnpm add -D tailwindcss`.
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @project-river/web build` exits 0 and creates `apps/web/.output/`.
- **Committed in:** `ebab295`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for a working build. No scope creep.

## Issues Encountered

- `npm create nuxt@latest` was partially interactive despite `CI=true`; fallback to `npx nuxi@latest init` succeeded and produced the template.
- vue-router peer dependency warning from `@nuxt/ui` (expects ^4.5.0, found 5.0.4). This does not block the build, and Nuxt v4 ships vue-router 5.x by design. Left as-is.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Frontend app is ready for linting/formatting setup (Plan 03) and subsequent UI/visualization work.
- No blockers.

## Self-Check: PASSED

- [x] SUMMARY.md created
- [x] Commit acdb6a4 exists
- [x] Commit 0212ed6 exists
- [x] Commit ebab295 exists

---
*Phase: 01-setup-infrastructure*
*Completed: 2026-04-09*
