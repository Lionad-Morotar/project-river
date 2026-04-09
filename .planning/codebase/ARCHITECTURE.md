# 架构

**分析日期：** 2026-04-09

## 架构概览

**整体模式：** Monorepo（pnpm workspaces），单向数据管线：**CLI ETL → PostgreSQL → Nuxt API → SPA（D3 Streamgraph）**

**关键特征：**
- 两阶段架构：离线数据采集（CLI）与在线可视化（Web 应用）
- 纯 SPA 的 Nuxt 4（`ssr: false`），D3.js 直接 DOM 操作渲染图表
- 共享数据库 Schema（`@project-river/db` 包），pipeline CLI 与 Web API 共用
- PostgreSQL 为单一事实来源，Drizzle ORM 提供类型安全的查询

## 应用

### `apps/web` — Nuxt v4 SPA

**用途：** Git 贡献者活动的交互式 Streamgraph 可视化。

**关键文件：**
- `apps/web/nuxt.config.ts` — Nuxt 配置，SPA 模式，Tailwind v4，`@nuxt/ui`，`@vueuse/nuxt`
- `apps/web/app/app.vue` — 根布局组件（`NuxtPage` 包装），深色主题
- `apps/web/app/pages/projects/[id]/index.vue` — 唯一页面：所有图表状态、数据获取、月份选择、详情面板

**组件（`apps/web/app/components/`）：**
- `Streamgraph.vue` — 基于 D3 的 Streamgraph 图表（313 行）。使用 `d3-shape` 的 `stackOffsetWiggle` + `stackOrderInsideOut`。实现缩放（`d3-zoom`）、刷选导航（`d3-brush`）和指针悬停提示。所有渲染通过命令式 `select().append()` API，非 SVG 模板。
- `StreamgraphTooltip.vue` — 跟随指针事件绝对定位的浮动提示
- `MonthSelector.vue` — `USelectMenu` 下拉框，选择 YYYY-MM 月份
- `MonthDetailPanel.vue` — 可拖拽、贴边面板，展示选中月份各贡献者统计，支持上/下月导航和 SVG 导出

**组合式函数（`apps/web/app/composables/`）：**
- `useContributorColors.ts` — 黄金角（137.508°）HSL 颜色分配。确定性：同一贡献者始终获得相同颜色。

**工具函数（`apps/web/app/utils/`）：**
- `d3Helpers.ts` — `pivotDailyData()`：将扁平的 `[date, contributor, commits]` 行转为宽格式 `{date, [contributor]: commits}` 供 D3 stack 使用。`buildStack()`：封装 `d3Stack().keys().order().offset()`
- `monthDetailHelpers.ts` — `getMonthContributors()`：聚合月度 + 累计提交数。`getMonthCumulative()`：从 `daily_stats` 提取月末累计数据
- `svgExport.ts` — `downloadStreamgraphSvg()`：克隆 SVG、内联字体、追加颜色图例（Top 10 贡献者）、触发浏览器下载

**服务端 API（`apps/web/server/api/`）：**
- `daily.get.ts` — 返回每日贡献者统计。使用 PostgreSQL `generate_series` + CROSS JOIN 填补空缺日（零提交日）。包含 `sum_day` 表的累计数据。
- `monthly.get.ts` — 返回月度统计。通过 `to_char()` 按 `YYYY-MM` 分组。无累计数据。
- 两个端点均使用 Zod 校验查询参数（`start`、`end`、`limit`、`offset`），验证项目存在性，返回类型化行数据

### `apps/web/test/` — 前端测试

- `test/utils/d3Helpers.test.ts` — pivot 和 stack 工具函数测试
- `test/utils/monthDetailHelpers.test.ts` — 月度聚合测试
- `test/utils/svgExport.test.ts` — SVG 序列化测试
- `test/composables/useContributorColors.test.ts` — 颜色分配测试（确定性、唯一性、去重）
- `server/api/projects/[id]/daily.get.test.ts` — 对真实 PostgreSQL 的集成测试（未设 `DATABASE_URL` 时跳过）
- `server/api/projects/[id]/monthly.get.test.ts` — 对真实 PostgreSQL 的集成测试

## 包

### `packages/db` — 数据库 Schema 与客户端

**用途：** 共享数据库层，`@project-river/pipeline` 和 `@project-river/web` 共用。

**导出：**
- `@project-river/db` → `src/index.ts`（重新导出 client + schema 命名空间）
- `@project-river/db/client` → `src/client.ts`（`db` Drizzle 实例 + `pg` 连接池）
- `@project-river/db/schema` → `src/schema/index.ts`（所有表定义）

**Schema 文件：**
- `src/schema/core.ts` — `projects`、`commits`、`commit_files` 表
  - `projects`：id（serial）、name、path、createdAt
  - `commits`：id、projectId（外键→projects 级联）、hash、authorName、authorEmail、committerDate、message。索引 `(projectId, committerDate)`
  - `commit_files`：id、commitId（外键→commits 级联）、path、insertions、deletions。索引 `commitId`
- `src/schema/stats.ts` — `daily_stats`、`sum_day` 表
  - `daily_stats`：id、projectId（外键→projects 级联）、date（字符串 YYYY-MM-DD）、contributor（邮箱）、commits、insertions、deletions、filesTouched。索引 `(projectId, date)`
  - `sum_day`：id、projectId（外键→projects 级联）、date、contributor、cumulativeCommits、cumulativeInsertions、cumulativeDeletions。索引 `(projectId, date)`

**客户端（`src/client.ts`）：**
- 从 `DATABASE_URL` 环境变量创建单一 `pg.Pool`
- 导出 `db`（带 Schema 的 Drizzle 实例）和 `pool` 供生命周期管理

### `packages/pipeline` — Git ETL CLI

**用途：** 解析 Git 仓库、聚合提交统计、写入 PostgreSQL。

**入口：** `src/cli.ts` — 基于 Bun 的 CLI（`#!/usr/bin/env bun`），作为 `analyze` 命令暴露。接受 `<repo-path> [project-name]` 参数，支持 `--batch-size`、`--force`、`--incremental` 标志。

**管线（`src/db/analyze.ts`）：**
1. 在 `projects` 表中查找或创建项目记录
2. 若 `--incremental`，获取已有提交哈希以跳过
3. 流式解析所有提交（`parseRepo()` 调用 `git log --no-merges --format=... --numstat`）
4. 按月分组提交，每月事务内刷新：
   a. 批量插入 `commits` 行（默认 2000）
   b. 构建 hash→id 映射用于外键解析
   c. 批量插入 `commit_files` 行
   d. 通过 `calcDay()` 计算 `daily_stats` 并批量插入
5. 所有月份完成后，调用 `generateSumDay()` 填充 `sum_day` 累计表

**解析器（`src/parser.ts`）：**
- `parseRepo(repoPath)`：AsyncGenerator，在目标目录生成 `git log`，产出 `ParsedCommit` 对象
- `parseLogStream(lines)`：AsyncGenerator，解析 Tab 分隔的 git log 输出，处理头行（提交元数据）和 numstat 行（文件变更）

**计算器（`src/calcDay.ts`）：**
- `calcDay(commits)`：纯函数，将 `ParsedCommit` 数组聚合为 `DailyStat[]` — 每个（日期, 贡献者）一对一行。使用 UTC 日期（`toISOString().slice(0,10)`），通过 `Set` 去重文件。

**累计生成器（`src/db/sumDay.ts`）：**
- `generateSumDay(projectId)`：删除项目所有 `sum_day` 行，然后通过窗口函数 INSERT：`SUM(commits) OVER (PARTITION BY contributor ORDER BY date)` 计算累计值。

### `packages/pipeline/tests/` — 管线测试

- `tests/parser.test.ts` — Git log 解析测试
- `tests/calcDay.test.ts` — 每日聚合测试（UTC 边界、多贡献者、空提交）
- `tests/cli.test.ts` — CLI 参数解析测试
- `tests/analyze.test.ts` — 完整分析管线测试
- `tests/sumDay.test.ts` — 累计统计生成测试

## 数据流

**采集（离线，CLI）：**

1. 用户执行：`analyze <repo-path> [project-name]`
2. CLI 生成 `git log` 流式读取所有提交（排除合并提交）
3. `parser.ts` 解析 Tab 分隔输出为 `ParsedCommit` 对象（AsyncGenerator）
4. `analyze.ts` 按月分组提交，在事务内批量写入 PostgreSQL
5. `calcDay()` 从解析的提交计算每日贡献者聚合
6. `generateSumDay()` 通过 PostgreSQL 窗口函数计算累计统计
7. 管线完成 — 数据可被 Web 应用查询

**可视化（在线，SPA）：**

1. 用户访问 `/projects/{id}`
2. `index.vue` 页面通过 `$fetch` 并行获取每日 + 每月数据
3. `Streamgraph.vue` 将每日数据转为宽格式，构建 D3 stack，渲染 SVG
4. 用户交互：缩放（捏合/拖拽）、刷选时间范围、点击选中月份
5. `MonthDetailPanel` 展示各贡献者明细（月度 + 累计提交数）
6. 用户可将图表导出为独立 SVG 文件（含图例）

**状态管理：**
- 所有图表状态位于页面组件（`projects/[id]/index.vue`），使用 `ref()` 和 `computed()`
- D3 维护自己的内部 DOM 状态（缩放变换、刷选区域）— 通过 watchers 同步
- 无全局状态仓库（Pinia/Vuex）— 组件级状态足以满足当前规模

## 错误处理

**策略：** 优雅降级 + 面向用户的错误消息。

**模式：**
- API 端点：h3 的 `createError()` 配合适当的 HTTP 状态码（400、404）
- 查询校验：Zod Schema 在访问数据库前拒绝格式错误的参数
- Web 页面：`$fetch` 使用 try/catch，`loading` 和 `error` ref 状态；无数据时显示降级 UI
- 管线：抛出描述性错误（如 `Project already analyzed: ... Use --force or --incremental.`）

## 横切关注点

**日志：** 仅 console（`console.error`、`console.warn`）。无结构化日志框架。

**校验：** API 查询参数使用 Zod。数据库插入使用 Drizzle Schema 类型。

**认证：** 无。应用完全开放 — 无认证、无权限控制、无限速。

**安全：** `DATABASE_URL` 通过环境变量传递。`docker-compose.yml` 中的硬编码默认凭据（postgres/postgres、admin/admin）仅用于开发。

---

*架构分析：2026-04-09*
