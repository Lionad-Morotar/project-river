# 架构

**分析日期：** 2026-04-23

## 架构概览

**整体模式：** Monorepo（pnpm workspaces），双模式运行（API 模式 + 静态模式），单向数据管线：**CLI ETL / GitHub 导入 → PostgreSQL → Nuxt API / 静态 Bundle → SPA（D3 Streamgraph）**

**关键特征：**
- 两阶段架构：离线数据采集（CLI 或 GitHub 导入）与在线可视化（Web 应用）
- 纯 SPA 的 Nuxt 4（`ssr: false`），D3.js 直接 DOM 操作渲染图表
- 共享数据库 Schema（`@project-river/db` 包），pipeline CLI、Web API、导入服务共用
- PostgreSQL 为单一事实来源，Drizzle ORM 提供类型安全的查询
- **双模式运行**：API 模式（完整服务端）与静态模式（`STATIC_MODE=true`，无服务端，使用预打包的 `demo.bin`）
- 全站 i18n（中英双语），深色/亮色主题切换，View Transition 动效

## 应用

### `apps/web` — Nuxt v4 SPA

**用途：** Git 贡献者活动的交互式 Streamgraph 可视化。

**关键文件：**
- `apps/web/nuxt.config.ts` — Nuxt 配置，SPA 模式，Tailwind v4，`@nuxt/ui`，`@vueuse/nuxt`，`@nuxtjs/i18n`
- `apps/web/app/app.vue` — 根布局组件（`NuxtPage` 包装），支持 i18n 语言属性和深色/亮色主题
- `apps/web/app/pages/index.vue` — 首页：URL 输入、项目列表、导入状态 UI、Hero 区、示例项目选择
- `apps/web/app/pages/projects/[id]/index.vue` — 项目详情页：所有图表状态、数据获取、月份选择、详情面板、事件检测、健康摘要

**组件（`apps/web/app/components/`）：**
- `Streamgraph.vue` — 基于 D3 的主 Streamgraph 图表（~473 行）。使用 `d3-shape` 的 `stackOffsetWiggle` + `stackOrderInsideOut`。实现缩放（`d3-zoom`）、刷选导航（`d3-brush`）、指针悬停提示、事件标记线、贡献者标签内联显示。所有渲染通过命令式 `select().append()` API，非 SVG 模板
- `StreamgraphTooltip.vue` — 跟随指针事件绝对定位的浮动提示，支持日/周/月粒度标签
- `MonthSelector.vue` — 自定义下拉选择 YYYY-MM 月份，支持 "All History" 选项
- `MonthDetailPanel.vue` — 停靠/浮动面板，展示选中月份各贡献者统计，支持上/下月导航、SVG 导出、环比指标
- `ProjectLayout.vue` — 项目详情页布局骨架：chart + panel 1:2 比例，支持停靠（top/left/right/bottom）和浮动模式，resize 拖拽
- `DraggablePanel.vue` — 浮动态面板拖拽与 viewport 边界钳制
- `ResizeHandle.vue` — 横竖双方向 resize handle，支持键盘微调（Arrow keys ±10px）
- `ProjectCard.vue` — 项目卡片（玻璃态样式），展示项目状态、摘要统计、操作按钮
- `ProjectEventsPanel.vue` — 项目事件列表面板，支持展开/折叠
- `EventGroupSelector.vue` — 事件类型树形分组选择器，支持勾选/半选状态
- `EventMarkerTooltip.vue` — 事件标记悬停提示
- `HealthSummary.vue` — 健康度信号标签组（concentration、activity-drop 等）
- `GitRiverCanvas.vue` — 首页 ASCII 字符河流背景（Canvas 2D），基于噪声函数生成流动效果
- `HeroStreamgraph.vue` — 首页 Hero 区迷你 Streamgraph（静态数据渲染）
- `SettingsModal.vue` — 设置弹窗：主题配色切换、本地保存选项
- `ConfirmDialog.vue` — 确认对话框（删除/重新分析二次确认）
- `StatsCard.vue` — 统计卡片（玻璃态），带动画计数器
- `AnimatedCounter.vue` — 数字递增动画组件（easeOutQuart）

**组合式函数（`apps/web/app/composables/`）：**
- `useContributorColors.ts` — HSL 颜色分配：基于首次提交日期（hue）和总贡献量（saturation）。支持主题色盘（baseHue + hueSpread）
- `useStreamgraphData.ts` — 数据透传 + Top-N 聚合（`applyTopN`），定义 `BACKEND_TOP_LIMIT = 99`、`OTHERS_LABEL = 'Other contributors'`
- `useProjectData.ts` — 项目数据生命周期管理：API 模式（`$fetch` 轮询）与静态模式（`useStaticData`）统一抽象
- `useProjectEvents.ts` — 项目事件检测：定义事件类型、分组树、Web Worker 调用封装
- `useProjectImport.ts` — GitHub/本地仓库导入流程：状态机（idle → importing → analyzing → redirecting）、轮询状态
- `useProjectStats.ts` — 项目统计派生：总提交数、贡献者数、日期范围、最近活跃度
- `useStaticData.ts` — 静态数据加载器：浏览器端解压 `demo.bin`（pako inflate + 列式格式解析），提供统一数据接口
- `useAppSettings.ts` — 应用设置：主题色盘（nebula/amber/default/sunset）、LocalStorage 持久化、Nuxt UI primary 同步
- `useChartTheme.ts` — 图表主题颜色：深色/亮色两套配色（axis、grid、brush、crosshair 等）
- `useChartTooltip.ts` — 图表提示状态管理：位置计算（边界防溢出）、数据绑定
- `useLocale.ts` — i18n 辅助：月份名数组、短日期格式化、紧凑数字、相对时间、活跃度标签

**工具函数（`apps/web/app/utils/`）：**
- `d3Helpers.ts` — `pivotDailyData()`：扁平行转宽格式。`buildStack()`：封装 D3 stack。`aggregateRows()` / `toWeekKey()`：周/月粒度聚合
- `d3ChartTypes.ts` — D3 类型别名 + 图表常量（MARGIN、BRUSH_HEIGHT、MIN_THICKNESS_PX 等）
- `d3SvgSkeleton.ts` — D3 SVG 骨架创建：缩放、刷选、坐标轴、裁剪路径、标注层
- `d3HoverSystem.ts` — 悬停交互系统：十字线、高亮层、O(1) 数据查找
- `monthDetailHelpers.ts` — `getMonthContributors()`、`getRangeContributors()`：月度/区间贡献者聚合
- `svgExport.ts` — `downloadStreamgraphSvg()`：克隆 SVG、内联字体、追加颜色图例、触发下载。支持深色/亮色主题导出
- `healthRules.ts` — 健康规则引擎：`evaluateHealthRules()` 评估贡献集中度、活跃度下降、提交频率等信号
- `githubUrl.ts` — GitHub URL 解析器 + 本地路径解析器 + 安全校验
- `errorGuidance.ts` — 错误分类映射：将服务端错误前缀（GH_NOT_FOUND、PATH_INVALID 等）映射为 i18n 键值
- `periodHelpers.ts` — 年份提取与范围计算
- `quarterHelpers.ts` — 季度转换与范围计算

**服务端 API（`apps/web/server/api/`）：**
- `projects/index.get.ts` — 项目列表（按 lastAnalyzedAt 倒序）
- `projects/[id].get.ts` — 项目详情（含 contributorCount 子查询）
- `projects/[id].delete.ts` — 删除项目
- `projects/import.post.ts` — GitHub URL / 本地路径导入，创建项目记录并触发异步分析
- `projects/[id]/daily.get.ts` — 每日数据（原始，保留兼容）
- `projects/[id]/daily-aggregated.get.ts` — 每日聚合数据（Top-99 + Others 汇总，后端聚合）
- `projects/[id]/monthly.get.ts` — 月度数据
- `projects/[id]/health.get.ts` — 健康度信号（基于 daily_stats 实时计算）
- `projects/[id]/import-status.get.ts` — 导入状态轮询（no-store 缓存头）
- `projects/[id]/reanalyze.post.ts` — 重新分析项目（GitHub 项目）

**服务端工具（`apps/web/server/utils/`）：**
- `importProject.ts` — 导入核心逻辑：`importProject()`（GitHub clone + analyze）、`importLocalProject()`（本地路径直接分析）、`extractHeadHash()`（HEAD commit hash 缓存）、错误分类
- `projectStats.ts` — API 共享模块：查询参数 Zod Schema、项目存在性断言、日期边界构建

**Web Worker（`apps/web/app/workers/`）：**
- `projectEvents.worker.ts` — 项目事件检测算法：contributor_first_commit、contributor_exit、activity_spike、activity_drop、major_refactor、commit_milestone、project_start、project_archived。在独立线程运行，避免阻塞主线程

**静态数据脚本（`apps/web/scripts/`）：**
- `export-project-data.ts` — 从 PostgreSQL 导出项目数据，列式压缩为 `demo.bin`（deflateSync）

### `packages/db` — 数据库 Schema 与客户端

**用途：** 共享数据库层，`@project-river/pipeline`、Web API、导入服务共用。

**导出：**
- `@project-river/db` → `src/index.ts`（重新导出 client + schema 命名空间）
- `@project-river/db/client` → `src/client.ts`（`db` Drizzle 实例 + `pg` 连接池）
- `@project-river/db/schema` → `src/schema/index.ts`（所有表定义）

**Schema 文件：**
- `src/schema/core.ts` — `projects`、`commits`、`commit_files` 表
  - `projects`：id（serial）、name、path、url、fullName、status（默认 'ready'）、description、lastAnalyzedAt、errorMessage、headCommitHash、createdAt。索引：fullName 唯一、status、lastAnalyzedAt
  - `commits`：id、projectId（外键→projects 级联）、hash、authorName、authorEmail、committerDate、message。索引：(projectId, committerDate)、(projectId, hash) 唯一
  - `commit_files`：id、commitId（外键→commits 级联）、projectId（外键→projects 级联，反规范化）、path、insertions、deletions。索引：commitId、projectId、(commitId, path) 唯一
- `src/schema/stats.ts` — `daily_stats`、`sum_day` 表
  - `daily_stats`：id、projectId（外键→projects 级联）、date（字符串 YYYY-MM-DD）、contributor、commits、insertions、deletions、filesTouched。索引：(projectId, date)、(projectId, date, contributor) 唯一
  - `sum_day`：id、projectId（外键→projects 级联）、date、contributor、cumulativeCommits、cumulativeInsertions、cumulativeDeletions。索引：(projectId, date)、(projectId, date, contributor) 唯一

**客户端（`src/client.ts`）：**
- 从 `DATABASE_URL` 环境变量创建单一 `pg.Pool`
- 导出 `db`（带 Schema 的 Drizzle 实例）和 `pool` 供生命周期管理

### `packages/pipeline` — Git ETL CLI

**用途：** 解析 Git 仓库、聚合提交统计、写入 PostgreSQL。

**入口：** `src/cli.ts` — 基于 Bun 的 CLI（`#!/usr/bin/env bun`），作为 `analyze` 命令暴露。接受 `<repo-path> [project-name]` 参数，支持 `--batch-size`、`--force`、`--incremental`、`--ignore` 标志。

**管线（`src/db/analyze.ts`）：**
1. 在 `projects` 表中查找或创建项目记录
2. 若 `--incremental`，获取已有提交哈希以跳过
3. 流式解析所有提交（`parseRepo()` 调用 `git log --no-merges --format=... --numstat`）
4. 按月分组提交，每月事务内刷新：
   a. 批量插入 `commits` 行（默认 2000）
   b. 构建 hash→id 映射用于外键解析
   c. 批量插入 `commit_files` 行
   d. 通过 `calcDay()` 计算 `daily_stats` 并批量插入（upsert：ON CONFLICT UPDATE）
5. 所有月份完成后，调用 `generateSumDay()` 填充 `sum_day` 累计表
6. `--ignore` 模式下，按提交时点的 `.gitignore` 过滤 `commit_files`

**解析器（`src/parser.ts`）：**
- `parseRepo(repoPath)`：AsyncGenerator，在目标目录生成 `git log`，产出 `ParsedCommit` 对象
- `parseLogStream(lines)`：AsyncGenerator，解析 Tab 分隔的 git log 输出，处理头行（提交元数据）和 numstat 行（文件变更）

**计算器（`src/calcDay.ts`）：**
- `calcDay(commits)`：纯函数，将 `ParsedCommit` 数组聚合为 `DailyStat[]` — 每个（日期, 贡献者）一对一行。使用 UTC 日期（`toISOString().slice(0,10)`），通过 `Set` 去重文件

**累计生成器（`src/db/sumDay.ts`）：**
- `generateSumDay(projectId)`：删除项目所有 `sum_day` 行，然后通过窗口函数 INSERT：`SUM(commits) OVER (PARTITION BY contributor ORDER BY date)` 计算累计值

**.gitignore 追踪（`src/db/gitignore.ts`）：**
- `buildGitignoreLookup()` / `getGitignoreHistory()`：追踪每个提交时点的 `.gitignore` 规则，用于过滤不应计入统计的文件

## 数据流

**采集（离线，CLI）：**

1. 用户执行：`analyze <repo-path> [project-name]`
2. CLI 生成 `git log` 流式读取所有提交（排除合并提交）
3. `parser.ts` 解析 Tab 分隔输出为 `ParsedCommit` 对象（AsyncGenerator）
4. `analyze.ts` 按月分组提交，在事务内批量写入 PostgreSQL
5. `calcDay()` 从解析的提交计算每日贡献者聚合
6. `generateSumDay()` 通过 PostgreSQL 窗口函数计算累计统计
7. 管线完成 — 数据可被 Web 应用查询

**导入（在线，异步）：**

1. 用户在首页粘贴 GitHub URL 或本地路径
2. `POST /api/projects/import` 验证输入，创建项目记录（status = 'cloning'）
3. 服务端异步执行：`gh repo clone` 或验证本地路径 → `analyzeRepo()` → 更新 status
4. 前端轮询 `GET /api/projects/[id]/import-status` 直至 ready/error
5. 导入完成自动跳转 `/projects/[id]`

**可视化（在线，SPA）：**

1. 用户访问 `/projects/{id}`
2. `index.vue` 页面通过 `useProjectData` 获取数据：
   - API 模式：`$fetch` 并行获取每日聚合 + 月度数据 + 项目元数据
   - 静态模式：从 `demo.bin` 解压获取
3. `Streamgraph.vue` 将每日数据转为宽格式，构建 D3 stack，渲染 SVG
4. 用户交互：缩放（捏合/拖拽）、刷选时间范围、点击选中月份、hover 查看贡献者详情
5. `MonthDetailPanel` 展示各贡献者明细（月度 + 累计提交数、环比变化）
6. `ProjectEventsPanel` 展示自动检测的项目事件（贡献者加入/退出、活跃度波动等）
7. `HealthSummary` 展示健康度信号标签
8. 用户可将图表导出为独立 SVG 文件（含图例、健康信号）

**静态模式（无服务端）：**

1. 构建时 `STATIC_MODE=true` 触发 `scripts/export-project-data.ts` 导出数据到 `public/data/demo.bin`
2. 运行时 `useStaticData` 从 `demo.bin` 解压并解析列式数据
3. 首页和详情页均使用静态 bundle 数据源
4. GitHub Pages 自动部署（`.github/workflows/deploy.yml`）

**状态管理：**
- 所有图表状态位于页面组件（`projects/[id]/index.vue`），使用 `ref()` 和 `computed()`
- D3 维护自己的内部 DOM 状态（缩放变换、刷选区域）— 通过 watchers 同步
- 面板布局状态（dockedEdge、panelW、panelH、floatX、floatY）使用 `useStorage` 持久化到 LocalStorage
- 无全局状态仓库（Pinia/Vuex）— 组件级状态 + composables 足以满足当前规模

## 错误处理

**策略：** 优雅降级 + 面向用户的错误消息。

**模式：**
- API 端点：h3 的 `createError()` 配合适当的 HTTP 状态码（400、404）
- 查询校验：Zod Schema 在访问数据库前拒绝格式错误的参数
- Web 页面：`$fetch` 使用 try/catch，`loading` 和 `error` ref 状态；无数据时显示降级 UI
- 导入流程：错误分类前缀（GH_NOT_FOUND、PATH_INVALID 等）→ `errorGuidance.ts` 映射为 i18n 键值 → 用户友好提示
- 管线：抛出描述性错误（如 `Project already analyzed: ... Use --force or --incremental.`）

## 横切关注点

**日志：** 仅 console（`console.error`、`console.warn`）。无结构化日志框架。

**校验：** API 查询参数使用 Zod。数据库插入使用 Drizzle Schema 类型。

**认证：** 无。应用完全开放 — 无认证、无权限控制、无限速。

**安全：** `DATABASE_URL` 通过环境变量传递。`docker-compose.yml` 中的硬编码默认凭据（postgres/postgres、admin/admin）仅用于开发。导入 API 有路径黑名单（`/proc`、`/sys` 等系统目录）。

**i18n：** `@nuxtjs/i18n` 模块，策略 `no_prefix`。翻译文件位于 `i18n/locales/`（`zh-CN.ts`、`en.ts`）。所有 UI 字符串通过 `$t()` 或 `useI18n().t()` 访问。

**主题：** Nuxt UI v4 语义令牌 + 自定义 CSS 变量（`--glass-border`、`--glass-bg` 等）。`useColorMode()` 管理深色/亮色。`useAppSettings` 管理 4 套 contributor 配色主题。View Transition API 实现主题/语言切换的圆形揭示动效。

---

*架构分析：2026-04-23*
