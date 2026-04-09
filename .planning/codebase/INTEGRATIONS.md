# 外部集成

**分析日期：** 2026-04-09

## API 与外部服务

**Git 仓库分析（CLI 管线）：**
- `@project-river/pipeline` — 读取本地 Git 仓库，解析 `git log` 输出为结构化数据
  - CLI 入口：`pnpm --filter @project-river/pipeline analyze`（来自 package.json 的 `bin.analyze`）
  - 输出：将解析后的提交数据写入 PostgreSQL

**未检测到任何第三方外部 API。** 应用完全自托管。

## 数据存储

**数据库：**
- PostgreSQL 16（定义于 `docker-compose.yml`）
  - 连接：`DATABASE_URL` 环境变量（`packages/db/drizzle.config.ts` 使用）
  - 客户端：`drizzle-orm` 0.45.2 + `pg` 8.20.0 驱动
  - Schema：`packages/db/src/schema/core.ts`（projects、commits、commit_files），`packages/db/src/schema/stats.ts`（daily_stats、sum_day）

**数据库管理：**
- pgAdmin（最新版）— 通过 `docker-compose.yml`，访问地址 `localhost:5050`
- Drizzle Studio — 通过 `pnpm db:studio`

**缓存：**
- 未检测到。无 Redis 或内存缓存。

## 认证与身份

**认证：**
- 无。未检测到任何认证系统，应用完全开放。

## 监控与可观测性

**错误追踪：**
- 未检测到。无 Sentry、Bugsnag 或类似工具。

**日志：**
- 仅控制台日志，未配置结构化日志框架。

## CI/CD 与部署

**托管平台：**
- 未配置。未检测到 Vercel、Netlify、Railway 等部署目标。

**CI 管线：**
- 未检测到。无 `.github/` 工作流或 `.gitlab-ci.yml`。

## Docker 服务

**`docker-compose.yml`：**
- `postgres:16` — PostgreSQL 数据库，端口 `5432`，数据卷 `postgres_data`
- `dpage/pgadmin4:latest` — 数据库管理 UI，端口 `5050`，数据卷 `pgadmin_data`

## 环境配置

**必需环境变量：**
- `DATABASE_URL` — PostgreSQL 连接字符串（Drizzle 配置必需，位于 `packages/db/drizzle.config.ts`）

**密钥位置：**
- `.env` 文件在项目根目录（存在，未提交 — 被 `.gitignore` 排除）

## Webhooks 与回调

**入站：**
- 无

**出站：**
- 无

## 数据流摘要

1. **采集**：CLI 管线（`@project-river/pipeline`）从本地仓库读取 `git log`，解析输出为结构化数据
2. **存储**：管线将 commits、commit_files、daily_stats、sum_day 写入 PostgreSQL（通过 Drizzle ORM）
3. **查询**：Nuxt Web 应用（`@project-river/web`）暴露 API 路由，位于 `server/api/projects/[id]/daily.get.ts` 和 `server/api/projects/[id]/monthly.get.ts`
4. **可视化**：前端基于 D3 渲染 Streamgraph

---

*集成审计：2026-04-09*
