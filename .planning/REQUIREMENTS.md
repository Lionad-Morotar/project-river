# Requirements

## v1 Requirements

### Infrastructure
- [x] **INFRA-01**: Initialize monorepo with pnpm workspace. Set up pnpm `--filter` scripts for `build`, `dev`, `lint` across packages.
- [x] **INFRA-02**: Bootstrap `apps/web` with Nuxt v4, Nuxt UI v4, Tailwind CSS v4, and VueUse

### Database
- [x] **DB-01**: Define PostgreSQL schema for `projects`, `commits`, `commit_files`, `daily_stats`, and `sum_day` tables
- [x] **DB-02**: Configure Drizzle ORM and migrations in `packages/db`
- [x] **DB-03**: Provide docker-compose for local PostgreSQL and verify migration succeeds

### Data Pipeline
- [x] **PIPE-01**: Implement streaming Git log parser (`git log --numstat`) with `--no-merges` to skip merge commits
- [x] **PIPE-02**: Implement `calcDay` algorithm to compute daily contributor statistics from parsed commits
- [x] **PIPE-03**: Implement `sumDay` algorithm to compute rolling cumulative statistics from daily stats
- [x] **PIPE-04**: Build CLI entrypoint (`analyze`) that parses a repo and writes to PostgreSQL in chunked batches

### API
- [ ] **API-01**: `GET /api/projects/:id/daily` returns daily contributor data for Streamgraph rendering
- [ ] **API-02**: `GET /api/projects/:id/monthly` returns monthly aggregated contributor metrics

### Frontend UI
- [ ] **UI-01**: Render interactive Streamgraph with D3 (`d3.stack` + `d3.area` + `wiggle` offset), day-level x-axis, unrestricted contributor layers
- [ ] **UI-02**: Implement month selector/brushing that highlights the selected month on the Streamgraph
- [ ] **UI-03**: Show tooltip on hover over contributor layer (contributor name, date, commits)
- [ ] **UI-04**: Build month detail panel with Current vs Cumulative metrics and top contributors list

### Export
- [ ] **EXPORT-01**: Add SVG export button that serializes the D3-generated SVG and triggers download

## v2 Requirements

- [ ] **V2-01**: Multi-repository comparison view
- [ ] **V2-02**: Real-time/live background updates to analysis
- [ ] **V2-03**: User authentication and multi-tenancy
- [ ] **V2-04**: Canvas/WebGL rendering for 100k+ node performance

## Out of Scope

| Item | Reason |
|------|--------|
| Non-PostgreSQL database support | Decision locked to Postgres for time-series reliability and Drizzle alignment |
| Custom git object parsing (libgit2) | `--numstat` stream is sufficient and avoids heavy native dependencies |
| Mobile-first responsive design | Phase 1 targets desktop analytics view |
| PDF/PNG raster export | SVG is sufficient for Phase 1 |

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| DB-01 | Phase 2 | Complete |
| DB-02 | Phase 2 | Complete |
| DB-03 | Phase 2 | Complete |
| PIPE-01 | Phase 3 | Complete |
| PIPE-02 | Phase 3 | Complete |
| PIPE-03 | Phase 4 | Complete |
| PIPE-04 | Phase 4 | Complete |
| API-01 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |
| UI-01 | Phase 6 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 7 | Pending |
| EXPORT-01 | Phase 7 | Pending |
