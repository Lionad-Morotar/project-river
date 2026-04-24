# 代码库结构

**分析日期：** 2026-04-23

## 目录布局

```
project-river/
├── apps/                        # 应用（可部署单元）
│   └── web/                     # Nuxt v4 SPA — Streamgraph 可视化
│       ├── app/                 # Nuxt 应用目录（自动导入）
│       │   ├── assets/css/      # 全局样式表 + 字体定义
│       │   ├── components/      # Vue SFC 组件（自动导入）
│       │   ├── composables/     # Vue 组合式函数（自动导入）
│       │   ├── pages/           # 基于文件的路由（自动导入）
│       │   ├── utils/           # 纯工具函数
│       │   └── workers/         # Web Workers
│       ├── e2e/                 # Playwright E2E 测试
│       ├── i18n/                # 国际化翻译文件
│       │   └── locales/         # zh-CN.ts、en.ts
│       ├── public/              # 静态资源（原样提供）
│       │   ├── data/            # demo.bin（静态模式数据）
│       │   └── fonts/           # Plus Jakarta Sans 自托管字体
│       ├── scripts/             # 构建时脚本
│       ├── server/              # Nuxt 服务端路由（Nitro）
│       │   ├── api/projects/    # REST API 端点
│       │   └── utils/           # 服务端共享工具
│       └── test/                # 前端测试
│           ├── components/      # 组件单元测试
│           ├── composables/     # 组合式函数单元测试
│           └── utils/           # 工具函数测试
├── packages/                    # 共享库（workspace 包）
│   ├── db/                      # 数据库 Schema + 客户端
│   │   ├── drizzle/             # 生成的迁移文件
│   │   │   └── meta/            # Drizzle 迁移元数据
│   │   └── src/
│   │       ├── schema/          # 表定义（Drizzle）
│   │       ├── client.ts        # PostgreSQL 连接池 + Drizzle 实例
│   │       └── index.ts         # 统一导出
│   └── pipeline/                # Git ETL CLI
│       ├── src/
│       │   ├── db/              # 数据库写入操作
│       │   ├── cli.ts           # CLI 入口（Bun）
│       │   ├── parser.ts        # Git log 解析器（AsyncGenerator）
│       │   ├── calcDay.ts       # 每日聚合（纯函数）
│       │   ├── types.ts         # 共享类型定义
│       │   └── index.ts         # 统一导出
│       └── tests/               # 管线单元 + 集成测试
├── .github/                     # GitHub 配置
│   └── workflows/               # CI/CD 工作流（GitHub Pages 部署）
├── .planning/                   # GSD 规划产物（不部署）
│   ├── codebase/                # 代码库分析文档（本目录）
│   ├── docs/                    # 规划文档
│   ├── milestones/              # 里程碑跟踪
│   └── phases/                  # 阶段跟踪
├── .claude/                     # Claude Code 工作区配置
├── .husky/                      # Git 钩子（husky）
├── .trae/                       # Trae IDE 配置
│   └── rules/                   # Trae 规则文件
├── .vscode/                     # VS Code 配置
├── docs/                        # 项目文档
│   ├── design/                  # 设计文档
│   ├── plans/                   # 计划文档
│   └── research/                # 研究文档
├── scripts/                     # 根级脚本
├── assets/                      # 品牌资产（logo 等）
├── data/                        # 本地开发数据（PostgreSQL、pgAdmin）
├── package.json                 # 根 workspace 配置
├── pnpm-workspace.yaml          # Workspace 声明
├── pnpm-lock.yaml               # 依赖锁定文件
├── vitest.workspace.ts          # Vitest workspace 配置
├── eslint.config.mjs            # ESLint 配置
├── docker-compose.yml           # PostgreSQL + pgAdmin 开发环境
├── .env                         # 环境变量（未提交）
├── .env.example                 # 环境变量模板
└── .gitignore                   # Git 忽略规则
```

## 目录用途

**`apps/`：**
- 用途：可部署的应用
- 内容：Nuxt Web 应用（`apps/web`）
- 关键文件：`apps/web/nuxt.config.ts`、`apps/web/package.json`

**`packages/`：**
- 用途：被应用或 CLI 消费的共享库
- 内容：数据库包（`packages/db`）、管线 ETL（`packages/pipeline`）
- 关键文件：`packages/db/src/schema/`、`packages/pipeline/src/cli.ts`

**`.planning/`：**
- 用途：GSD 命令产物 — 规划文档、里程碑、代码库分析
- 内容：跟踪项目演进的 Markdown 文档
- 生成方式：是（由 `/gsd:*` 命令生成）

**`.github/workflows/`：**
- 用途：GitHub Actions CI/CD
- 内容：`deploy.yml` — GitHub Pages 自动部署（STATIC_MODE 构建）

**`docs/`：**
- 用途：项目文档（设计、计划、研究）
- 内容：Markdown 文档

**`scripts/`：**
- 用途：根级辅助脚本

## 关键文件位置

**入口点：**
- `apps/web/app/app.vue`：Nuxt 根布局组件
- `apps/web/app/pages/index.vue`：首页 — URL 输入、项目列表、导入 UI
- `apps/web/app/pages/projects/[id]/index.vue`：项目详情页 — 完整可视化
- `packages/pipeline/src/cli.ts`：CLI 二进制入口（Bun）

**配置文件：**
- `pnpm-workspace.yaml`：Workspace 声明（`apps/*`、`packages/*`）
- `vitest.workspace.ts`：链接 `apps/web/vitest.config.ts` + `packages/pipeline/vitest.config.ts`
- `eslint.config.mjs`：@antfu/eslint-config，支持 Vue + TypeScript + 格式化 + 测试
- `docker-compose.yml`：PostgreSQL 16 + pgAdmin4 本地开发
- `packages/db/drizzle.config.ts`：Drizzle Kit 配置
- `apps/web/nuxt.config.ts`：Nuxt 配置（SPA 模式、Tailwind v4、@nuxt/ui、@vueuse/nuxt、@nuxtjs/i18n）

**核心逻辑：**
- `packages/pipeline/src/db/analyze.ts`：主 ETL 编排（解析 git、批量插入、生成累计统计）
- `packages/pipeline/src/parser.ts`：Git log 流式解析器
- `packages/pipeline/src/calcDay.ts`：每日聚合纯函数
- `packages/pipeline/src/db/sumDay.ts`：通过 PostgreSQL 窗口函数计算累计统计
- `packages/pipeline/src/db/gitignore.ts`：.gitignore 历史追踪与过滤
- `packages/db/src/schema/core.ts`：核心表（projects、commits、commit_files）
- `packages/db/src/schema/stats.ts`：统计表（daily_stats、sum_day）
- `apps/web/server/utils/importProject.ts`：GitHub/本地导入核心逻辑
- `apps/web/server/utils/projectStats.ts`：API 共享模块（Zod Schema、断言、边界）
- `apps/web/app/components/Streamgraph.vue`：D3 Streamgraph 渲染（~473 行）
- `apps/web/app/components/ProjectLayout.vue`：项目页面布局（停靠/浮动/resize）
- `apps/web/app/workers/projectEvents.worker.ts`：项目事件检测 Web Worker
- `apps/web/scripts/export-project-data.ts`：静态数据导出脚本

**测试：**
- `packages/pipeline/tests/`：解析器、calcDay、CLI、analyze、sumDay 测试
- `apps/web/test/components/`：组件单元测试（ResizeHandle）
- `apps/web/test/composables/`：组合式函数单元测试
- `apps/web/test/utils/`：工具函数测试
- `apps/web/server/api/projects/[id]/daily.get.test.ts`：API 集成测试
- `apps/web/server/api/projects/[id]/daily-aggregated.get.test.ts`：聚合端点集成测试
- `apps/web/server/api/projects/[id]/monthly.get.test.ts`：API 集成测试
- `apps/web/e2e/docked-panel.spec.ts`：Playwright E2E 测试

## 命名约定

**文件：**
- Vue 组件：PascalCase（`Streamgraph.vue`、`MonthDetailPanel.vue`、`ProjectLayout.vue`）
- TypeScript 模块：camelCase（`d3Helpers.ts`、`calcDay.ts`、`analyze.ts`）
- API 路由：`{handler}.{method}.ts` 约定（`daily.get.ts`、`import.post.ts`）
- 测试文件：`{source}.test.ts` 或 `{source}.spec.ts`
- Worker 文件：`{name}.worker.ts`
- 脚本文件：`{name}.ts`（camelCase）

**目录：**
- Snake case / kebab case（里程碑中的 `streamgraph-visualization`）
- 页面路由：`[id]` 用于动态参数（`apps/web/app/pages/projects/[id]/`）

**函数：**
- camelCase（`calcDay`、`parseRepo`、`pivotDailyData`、`buildStack`）
- Composables：`use{Something}.ts`（`useProjectData.ts`、`useContributorColors.ts`）

**类型/接口：**
- PascalCase + 描述性后缀（`ParsedCommit`、`DailyStat`、`DailyRow`、`ProjectEvent`、`HealthSignal`）

## 新增代码应放在哪里

**新页面或路由：**
- 主要代码：`apps/web/app/pages/{route-path}.vue`
- 新 API 端点：`apps/web/server/api/{route-path}.{method}.ts`

**新 Vue 组件：**
- 实现：`apps/web/app/components/ComponentName.vue`

**新组合式函数：**
- 实现：`apps/web/app/composables/useSomething.ts`

**新工具函数：**
- 共享工具：`apps/web/app/utils/helpers.ts`

**新 Web Worker：**
- 实现：`apps/web/app/workers/{name}.worker.ts`

**新数据库表：**
- Schema：`packages/db/src/schema/`（核心实体加到 `core.ts`，统计加到 `stats.ts`）
- 重新导出：`packages/db/src/schema/index.ts`（添加导出）
- 迁移：运行 `pnpm db:migrate`（生成到 `packages/db/drizzle/`）

**新管线功能：**
- 实现：`packages/pipeline/src/`（添加模块并从 `src/index.ts` 导出）
- 测试：`packages/pipeline/tests/{module}.test.ts`

**新共享库包：**
- 创建：`packages/{name}/`，包含 `package.json`、`src/index.ts`
- 注册：已被 `pnpm-workspace.yaml` 的 glob（`packages/*`）自动覆盖
- 添加依赖：`pnpm add @project-river/{name} --filter @project-river/web`

**新 i18n 翻译：**
- 中文：`apps/web/i18n/locales/zh-CN.ts`
- 英文：`apps/web/i18n/locales/en.ts`
- 两个文件必须保持键值同步

**新静态数据导出：**
- 脚本：`apps/web/scripts/{name}.ts`
- 输出：`apps/web/public/data/`

## 特殊目录

**`.planning/`：**
- 用途：GSD 命令产物 — 代码库分析、里程碑跟踪、阶段文档
- 生成方式：是（由 `/gsd:map-codebase`、`/gsd:plan-phase` 等命令生成）
- 是否提交：是（纳入 git 跟踪）

**`apps/web/public/data/`：**
- 用途：静态模式数据文件（`demo.bin`）
- 生成方式：是（由 `scripts/export-project-data.ts` 生成）
- 是否提交：是（GitHub Pages 部署必需）

**`apps/web/public/fonts/`：**
- 用途：自托管字体（Plus Jakarta Sans woff2/woff）
- 是否提交：是

**`apps/web/app/workers/`：**
- 用途：Web Workers（事件检测等 CPU 密集型任务）
- 是否提交：是

**`packages/db/drizzle/`：**
- 用途：Drizzle ORM 生成的迁移 SQL 和元数据
- 生成方式：是（由 `drizzle-kit generate`）
- 是否提交：是（生产数据库状态必需）

**`apps/web/.nuxt/` 和 `apps/web/node_modules/.cache/nuxt/`：**
- 用途：Nuxt 构建缓存和生成的类型
- 生成方式：是（由 `nuxt prepare` / `nuxt dev`）
- 是否提交：否（在 .gitignore 中）

**`data/`：**
- 用途：本地开发 PostgreSQL 和 pgAdmin 数据卷
- 是否提交：否（在 .gitignore 中）

---

*结构分析：2026-04-23*
