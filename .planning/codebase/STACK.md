# 技术栈

**分析日期：** 2026-04-23

## 语言

**主要：**
- TypeScript 5.8.3 — 全栈统一语言，前端 Vue SFC、后端 Nitro API、CLI 工具、数据库 Schema 均使用 TS

**辅助：**
- CSS (Tailwind CSS v4) — 样式系统，使用 `@import 'tailwindcss'` 语法
- SQL — 部分数据导出脚本直接编写原生 PostgreSQL 查询

## 运行时

**环境：**
- Node.js 22 (CI/CD 指定版本)
- Bun (CLI 执行器，`packages/pipeline/src/cli.ts` 使用 `#!/usr/bin/env bun`)

**包管理器：**
- pnpm 9 — 通过 `pnpm-workspace.yaml` 管理 monorepo
- Lockfile: `pnpm-lock.yaml` 存在

## 框架

**核心：**
- Nuxt 4.4.2 — Web 应用框架，`apps/web/nuxt.config.ts`
- Vue 3.5.32 — UI 框架，Composition API + `<script setup>`
- Vue Router 5.0.4 — 客户端路由（Nuxt 内置）

**数据可视化：**
- D3.js (模块化导入) — Streamgraph 河流图核心渲染
  - `d3-array` ^3.2.4
  - `d3-axis` ^3.0.0
  - `d3-brush` ^3.0.0
  - `d3-scale` ^4.0.2
  - `d3-selection` ^3.0.0
  - `d3-shape` ^3.2.0
  - `d3-time-format` ^4.1.0
  - `d3-zoom` ^3.0.0

**数据库：**
- Drizzle ORM 0.45.2 — 类型安全的 SQL 构建器
- Drizzle Kit 0.31.10 — 迁移和 Studio 工具
- PostgreSQL 16 — 通过 `pg` ^8.20.0 驱动连接

**测试：**
- Vitest 3.0.0 — 单元测试，workspace 模式 (`vitest.workspace.ts`)
- Playwright 1.59.1 — E2E 测试
- jsdom 29.0.2 — 组件测试环境
- `@vue/test-utils` 2.4.6 — Vue 组件测试工具

**构建/开发：**
- Vite (Nuxt 内置) — 构建工具
- TypeScript 5.8.3 — 类型检查和编译
- tsx — 执行 TypeScript 脚本（如 `export-project-data.ts`）

## 关键依赖

**UI 组件：**
- `@nuxt/ui` ^4.6.1 — Nuxt UI v4 组件库，基于 Tailwind CSS v4
- `@atlaskit/pragmatic-drag-and-drop` ^1.7.10 — 拖拽面板交互
- `tailwindcss` ^4.2.2 — CSS 框架

**国际化：**
- `@nuxtjs/i18n` ^10.2.4 — Vue I18n 的 Nuxt 模块
- 支持语言：zh-CN（默认）、en
- 策略：`no_prefix`，通过 cookie 检测浏览器语言

**工具库：**
- `@vueuse/core` ^14.2.1 / `@vueuse/nuxt` ^13.0.0 — Vue 组合式工具集
- `zod` ^3.24.0 — 运行时 Schema 验证（API 请求体验证）
- `pako` ^2.1.0 — 静态数据 bundle 压缩/解压
- `ignore` ^7.0.5 — `.gitignore` 模式匹配（Pipeline 文件过滤）

**基础设施：**
- `h3` ^1.15.0 — Nitro 的 HTTP 框架（API 路由）

## Monorepo 结构

```
project-river/
├── apps/web/          # Nuxt v4 Web 应用
├── packages/db/       # Drizzle ORM 数据库层
├── packages/pipeline/ # Git 分析 CLI 工具
└── package.json       # Root workspace 配置
```

**Workspace 包：**
- `@project-river/web` — Web 应用
- `@project-river/db` — 数据库 Schema、Client、迁移
- `@project-river/pipeline` — Git 分析引擎和 CLI

## 配置

**环境变量：**
- `.env.example` 存在于根目录和 `apps/web/`
- 关键变量：`DATABASE_URL`（PostgreSQL 连接字符串）
- `STATIC_MODE=true` — 静态生成模式开关，控制运行时数据获取策略

**构建配置：**
- `nuxt.config.ts` — Nuxt 配置，`apps/web/nuxt.config.ts`
  - `ssr: false` — 纯 CSR 模式
  - `baseURL` — 生产环境使用 `/project-river/`（GitHub Pages 子路径）
  - `colorMode.preference: 'system'` — 系统主题偏好
- `drizzle.config.ts` — 数据库迁移配置，`packages/db/drizzle.config.ts`
- `vitest.workspace.ts` — 测试 workspace 配置
- `eslint.config.mjs` — ESLint 配置，使用 `@antfu/eslint-config`

**TypeScript：**
- `apps/web/tsconfig.json` — 引用 Nuxt 生成的 tsconfig
- `packages/db/` 和 `packages/pipeline/` 使用各自目录下的 tsconfig

## 开发命令

```bash
# 开发服务器
pnpm dev                    # 启动 Web 应用 (localhost:10400)

# 构建
pnpm build                  # 全量构建（所有包）
pnpm build:bin              # 导出 demo 静态数据 bundle

# 静态站点
pnpm --filter @project-river/web generate:gh   # GitHub Pages 静态生成
pnpm --filter @project-river/web preview:gh    # 预览静态站点

# 数据库
pnpm db:migrate             # 执行数据库迁移

# 代码质量
pnpm lint                   # 全量 lint
pnpm lint:fix               # 自动修复 lint 错误

# 测试
pnpm test                   # 运行所有测试（Vitest workspace）
```

## 平台要求

**开发：**
- Node.js 22+
- pnpm 9+
- PostgreSQL 16（通过 docker-compose.yml 提供）
- Bun（用于执行 CLI 工具）

**生产部署：**
- GitHub Pages — 静态站点托管
- 基础路径：`/project-river/`
- 部署流程：GitHub Actions → `nuxt generate` → `actions/deploy-pages`

---

*技术栈分析：2026-04-23*
