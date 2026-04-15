# Roadmap

## Project

project-river — interactive Git history Streamgraph visualization.

## Phases

- [x] **Phase 9: Aggregated Streamgraph & Contributor Color Rework** — 服务端 Top-49+Rest 聚合与 HSL 色盘重构 (not started) (completed 2026-04-15)

## Phase Details

### Phase 9: Aggregated Streamgraph & Contributor Color Rework

**Goal**: 后端提供聚合后的每日数据接口，前端按时间与贡献量为 contributor 分配更具语义的颜色。

**Depends on**: Phase 8 (Documentation)

**Requirements**: API-03, API-04, VIZ-01, VIZ-02, VIZ-03, VIZ-04

**Success Criteria** (what must be TRUE):
  1. `GET /api/projects/:id/daily-aggregated` 返回不超过 50 个 contributor 层（Top 49 + Others）
  2. 聚合接口的响应结构与原 daily 接口一致，前端可无缝替换
  3. 贡献者颜色在 HSL 空间中沿时间轴分布色相，沿贡献量分布饱和度
  4. Streamgraph 渲染和交互行为保持不变

**Plans**: 2 plans

Plan list:
- `09-01-PLAN.md` — 聚合接口：实现 `daily-aggregated.get.ts`，SQL CTE 计算 Top 49 与 Others rollup，集成测试
- `09-02-PLAN.md` — 颜色算法：重构 `useContributorColors`，按 contributor 时间跨度与总贡献量生成 HSL，更新单元测试并替换前端调用

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Aggregated Streamgraph & Contributor Color Rework | 2/2 | Complete   | 2026-04-15 |
