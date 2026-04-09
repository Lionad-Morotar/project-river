# Smart Docs: apps/web

Nuxt v4 SPA application for the **project-river** Streamgraph visualization. Renders contributor activity over time with interactive D3-based charts, month selection, detail panels, and SVG export.

---

## Technology Stack

- **Framework**: Nuxt v4 (`ssr: false`)
- **UI Library**: Nuxt UI v4 + Tailwind CSS v4
- **Utilities**: VueUse (`useDraggable`, `useWindowSize`)
- **Visualization**: D3 v7 (`d3-shape`, `d3-scale`, `d3-selection`, `d3-array`, `d3-axis`, `d3-brush`, `d3-zoom`)
- **Testing**: Vitest + jsdom

---

## Entry Points

| File | Purpose |
|------|---------|
| `app.vue` | Root layout (dark slate theme wrapper + `<NuxtPage />`) |
| `pages/projects/[id]/index.vue` | Main project view: loads data, renders Streamgraph + controls |
| `nuxt.config.ts` | SPA mode, modules (`@nuxt/ui`, `@vueuse/nuxt`), CSS entry |

---

## Components

### `Streamgraph.vue`

Renders the main D3 Streamgraph with zoom, brush navigator, and month highlight overlay.

**Props**
- `data: DailyRow[]` — daily contributor stats
- `width: number`, `height: number` — chart dimensions
- `selectedMonth: string | null` — ISO month (`YYYY-MM`) to highlight

**Emits**
- `update:selectedMonth` — when brush/zoom infers a month change
- `hover` — contributor + date payload for tooltip

**Key behaviors**
- Uses `curveBasis` for smooth organic layers
- `stackOrderInsideOut` + `stackOffsetWiggle` for classic streamgraph symmetry
- Zoom scale extent `[1, 50]` with clamped translate extents
- Brush navigator at bottom for time-range selection
- `month-highlight` rect clipped to visible chart area
- Exposes `getSvg()` for export serialization

**D3 helpers used**: `buildStack`, `pivotDailyData` from `~/utils/d3Helpers`

---

### `MonthSelector.vue`

Thin wrapper around `USelectMenu` providing a dropdown of available months plus an "All history" null option.

**Props**
- `months: string[]`
- `modelValue: string | null`

---

### `MonthDetailPanel.vue`

Draggable, snap-to-edge panel showing metrics for the selected month.

**Props**
- `selectedMonth`, `availableMonths`, `contributors`, `commitsThisMonth`, `totalCommitsToDate`, `hasData`

**Features**
- `useDraggable` with handle on left edge (when docked right)
- Snaps to `left`, `right`, or `bottom` based on release position
- Previous / next month navigation buttons
- "Export SVG" button
- Contributor list sorted by monthly commits (desc)

---

### `StreamgraphTooltip.vue`

Simple positioned tooltip showing contributor, date, commits, lines changed, and files touched.

---

## Composables

### `useContributorColors.ts`

```ts
export function useContributorColors(contributors: string[]): Map<string, string>
export function getContributorColor(index: number, s?, l?): string
```

Generates an infinite, perceptually-distinct color palette using the **golden angle** (`137.508°`) in HSL space. Guarantees no "Others" bucket is needed regardless of contributor count.

---

## Utilities

### `d3Helpers.ts`

| Export | Purpose |
|--------|---------|
| `DailyRow` | Typed daily stat row (date, contributor, commits, linesAdded, linesDeleted, filesTouched, cumulativeCommits) |
| `PivotedRow` | Date-keyed object with per-contributor commit counts |
| `pivotDailyData(rows)` | Transforms `DailyRow[]` into `PivotedRow[]` with zero-filled gaps |
| `buildStack(contributors, data)` | Returns a D3 stack series ready for `d3Area` |

### `monthDetailHelpers.ts`

| Export | Purpose |
|--------|---------|
| `MonthlyRow` | Typed monthly aggregate |
| `MonthContributor` | Contributor entry for the detail panel |
| `getMonthCumulative(daily, yearMonth, contributor)` | Reads the last day of the month for cumulative stats |
| `getMonthContributors(monthly, daily, yearMonth, colorMap)` | Builds sorted panel rows with monthly + cumulative commits and colors |

### `svgExport.ts`

| Export | Purpose |
|--------|---------|
| `serializeSvgWithLegend(svgNode, contributors)` | Clones SVG, inlines a text style block, appends a top-right legend (max 10 contributors + "+N more"), returns serialized string |
| `downloadStreamgraphSvg(svgNode, filename, contributors)` | Creates a blob and triggers browser download of the serialized SVG |

---

## Server API Routes

Located under `server/api/projects/[id]/`.

### `daily.get.ts`

Returns daily contributor grid with cumulative commits.

**Query params**: `start?`, `end?` (ISO date), `limit?` (default 1000, max 5000), `offset?` (default 0)

**Validation**: Zod schema with regex date checks.

**SQL strategy**: CTE-based grid generation (`generate_series` cross join distinct contributors) left-joined against `daily_stats` and `sum_day`.

### `monthly.get.ts`

Returns monthly aggregated stats per contributor.

Same query param schema. Uses `to_char(date, 'YYYY-MM')` for month grouping.

Both routes verify project existence with a `SELECT 1 FROM projects` guard and return `400` / `404` on invalid input.

---

## Tests

Located in `test/` and co-located with server routes (`*.test.ts`).

| Test file | Coverage |
|-----------|----------|
| `composables/useContributorColors.test.ts` | Golden-angle color generation, deduplication, determinism |
| `utils/d3Helpers.test.ts` | `pivotDailyData` gap-filling and `buildStack` output shape |
| `utils/monthDetailHelpers.test.ts` | Cumulative lookup and contributor sorting |
| `utils/svgExport.test.ts` | Legend serialization, style inlining, "+N more" truncation |
| `server/api/projects/[id]/daily.get.test.ts` | Daily route 200/400/404 (with DB mock fallback) |
| `server/api/projects/[id]/monthly.get.test.ts` | Monthly route 200/400/404 |

---

## Architectural Patterns

- **SPA + SSR disabled**: Chosen for simpler D3 DOM integration without hydration mismatches.
- **Utility-first styling**: Tailwind v4 CSS-native with `@import 'tailwindcss'`.
- **Explicit h3 imports in server routes**: Enables direct Vitest execution without Nuxt auto-import context.
- **Computed data pipelines**: Chart data derivations (`pivotedData`, `series`, `yDomain`) are Vue `computed` properties, re-rendering D3 only when dimensions or source data change.
