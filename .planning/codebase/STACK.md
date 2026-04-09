# 技术栈

**分析日期：** 2026-04-09

## 编程语言

**主要：**
- TypeScript (v5.8.3) — 所有应用代码，覆盖 web、database、pipeline 包
- Vue 3 SFC（`.vue` 文件）— Web UI 组件

## 运行时

**环境：**
- Node.js（ESM，所有包均设置 `"type": "module"`）

**包管理器：**
- pnpm（monorepo workspaces）
- 锁定文件：`pnpm-lock.yaml` 存在

## 框架与库

**核心：**
- Nuxt v4.4.2 — Web 应用框架，SPA 模式（`ssr: false`）
- Vue 3.5.32 — 响应式 UI 库
- Vue Router 5.0.4 — 客户端路由

**数据库：**
- Drizzle ORM 0.45.2 — 类型安全的 PostgreSQL ORM
- Drizzle Kit 0.31.10 — Schema 迁移工具

**测试：**
- Vitest 3.0.0 — 单元测试框架（root workspace + 每包独立配置）
- Vue Test Utils 2.4.0 — Vue 组件测试
- JSDOM 29.0.2 — Web 测试的 DOM 模拟环境

**可视化：**
- D3.js 生态（array, axis, brush, scale, selection, shape, time-format, zoom）— Streamgraph 渲染

**代码检查 / 格式化：**
- ESLint 9.0.0 + `@antfu/eslint-config` 4.0.0 — Lint 规则（Vue + TypeScript + 格式化 + 测试）
- Husky 9.0.0 + lint-staged 15.0.0 — 提交前钩子

**构建 / 开发：**
- Nuxt 原生构建（`nuxt build`, `nuxt dev`）— 无需独立打包工具

## 关键依赖

**核心：**
- `zod` 3.24.0 — 运行时 Schema 验证（用于 API 输入校验）
- `h3` 1.15.0 — Nuxt 服务端 API 层（HTTP 处理器）
- `pg` 8.20.0 — PostgreSQL 驱动（`@project-river/db` 和 `@project-river/pipeline` 使用）

**UI/UX：**
- `@nuxt/ui` 3.1.0 — Nuxt UI 组件库
- `@vueuse/nuxt` 13.0.0 — Vue 组合工具函数

**CSS：**
- Tailwind CSS 4.2.2 — 工具类 CSS（通过 `@nuxt/ui` 引入）

## Workspace 结构

```
@project-river/root        — Monorepo 根目录（脚本、lint 配置）
@project-river/web         — Nuxt 4 Web 应用（SPA）
@project-river/db          — 共享 Drizzle Schema + 客户端
@project-river/pipeline    — CLI Git 分析管线
```

## 配置

**环境变量：**
- `.env` 文件存在于根目录（仅确认存在）
- `DATABASE_URL` 环境变量为必填（`packages/db/drizzle.config.ts` 使用）
- `docker-compose.yml` 提供本地 PostgreSQL 16 + pgAdmin

**构建命令：**
- `pnpm dev` — 启动 Nuxt 开发服务器（过滤到 `@project-river/web`）
- `pnpm build` — 构建 workspace 内所有包
- `pnpm test` — 运行 Vitest 全 workspace 测试
- `pnpm db:migrate` — 运行 Drizzle 迁移
- `pnpm db:generate` — 生成 Drizzle 迁移文件
- `pnpm db:studio` — 打开 Drizzle Studio GUI

**Lint 命令：**
- `pnpm lint` / `pnpm lint:fix` — ESLint 全包检查
- lint-staged 对 `*.{js,ts,mjs,cjs,vue,json,md}` 执行 `eslint --fix`

## 平台要求

**开发环境：**
- Node.js（需 ESM 支持）
- pnpm 包管理器
- PostgreSQL 16（Docker 或本地安装）

**生产环境：**
- 通过 `nuxt generate` 导出静态 SPA，或通过 `nuxt build` 以 Node.js 服务
- PostgreSQL 16 作为数据存储

---

*栈分析：2026-04-09*
