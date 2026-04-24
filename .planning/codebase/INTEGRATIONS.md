# 外部集成

**分析日期：** 2026-04-23

## APIs & 外部服务

**Git 仓库分析：**
- 本地 Git 可执行文件 — Pipeline 通过 `child_process.spawn('git', ...)` 调用系统 Git 命令解析仓库历史
  - 命令：`git log --no-merges --date=iso-strict --format=%H\t%aN\t%aE\t%cd\t%s --numstat`
  - 文件：`packages/pipeline/src/parser.ts`

**GitHub 仓库导入：**
- GitHub HTTPS 克隆 — Web 应用支持通过 GitHub URL 导入项目
  - URL 格式：`https://github.com/{owner}/{repo}.git`
  - 解析工具：`apps/web/app/utils/githubUrl.ts`
  - 克隆目录：`~/.project-river/repos/{owner}--{repo}`

**本地仓库导入：**
- 文件系统路径 — 支持导入本地 Git 仓库
  - 路径格式：`/absolute/path/to/repo` 或 `~/relative/path`
  - fullName 格式：`local:{resolvedPath}`
  - 验证：路径存在性、`.git` 目录、读权限、系统目录黑名单

## 数据存储

**数据库：**
- PostgreSQL 16
  - 连接：通过 `DATABASE_URL` 环境变量
  - ORM：Drizzle ORM 0.45.2
  - 客户端：`packages/db/src/client.ts`
  - Schema：`packages/db/src/schema/`（core.ts + stats.ts）

**Schema 表结构：**
- `projects` — 项目元数据（name, path, url, fullName, status, headCommitHash 等）
- `commits` — 提交记录（hash, authorName, authorEmail, committerDate, message）
- `commit_files` — 文件变更（commitId, projectId, path, insertions, deletions）
- `daily_stats` — 每日聚合统计（projectId, date, contributor, commits, insertions, deletions, filesTouched）
- `sum_day` — 累计统计（projectId, date, contributor, cumulativeCommits 等）

**文件存储：**
- 本地文件系统 — Git 仓库克隆到 `~/.project-river/repos/`
- 静态数据 bundle — `apps/web/public/data/demo.bin`（压缩后的列式 JSON）

**缓存：**
- 无外部缓存服务
- 应用内缓存：静态数据 bundle 单例缓存（`useStaticData.ts`）
- 浏览器缓存：localStorage 存储面板布局状态

## 认证与身份

**认证方式：**
- 无外部认证提供商
- 无需用户登录，所有功能匿名可用

## 监控与可观测性

**错误追踪：**
- 无外部错误追踪服务
- 控制台日志用于开发调试

**日志：**
- 服务端：Node.js `console.error` / `console.log`
- Pipeline CLI：标准输出/错误流

## CI/CD & 部署

**托管：**
- GitHub Pages — 静态站点部署
- 仓库：`Lionad-Morotar/project-river`
- 部署路径：`https://lionad-morotar.github.io/project-river/`

**CI 流水线：**
- GitHub Actions — `.github/workflows/deploy.yml`
- 触发条件：`push` 到 `main` 分支
- 流程：
  1. `actions/checkout@v4`
  2. `pnpm/action-setup@v4` (pnpm 9)
  3. `actions/setup-node@v4` (Node 22)
  4. `pnpm install --frozen-lockfile`
  5. `pnpm --filter @project-river/web generate`（`STATIC_MODE=true`）
  6. `actions/upload-pages-artifact@v3`
  7. `actions/deploy-pages@v4`

**Docker Compose（开发）：**
- `docker-compose.yml` — 本地开发数据库
  - `postgres:16` — PostgreSQL 服务，端口 5432
  - `dpage/pgadmin4:latest` — pgAdmin 管理界面，端口 5050

## 环境配置

**必需环境变量：**
- `DATABASE_URL` — PostgreSQL 连接字符串（如 `postgresql://postgres:postgres@localhost:5432/river`）

**可选环境变量：**
- `STATIC_MODE` — 静态模式开关，`true` 时禁用 API 调用，使用预构建的 demo.bin
- `NODE_ENV` — 环境标识，`production` 时设置 `baseURL` 为 `/project-river/`
- `REPOS_DIR` — 仓库克隆目录，默认 `~/.project-river/repos`

**环境文件：**
- `.env.example` — 根目录和 `apps/web/` 各有一份模板
- `.env` — 本地开发配置（已加入 `.gitignore`）

## Webhooks & 回调

**入站：**
- 无 Webhook 接收端点

**出站：**
- 无外部 Webhook 调用
- 内部 API 路由：
  - `GET /api/projects` — 项目列表
  - `GET /api/projects/:id` — 项目详情（含 contributorCount 子查询）
  - `POST /api/projects/import` — 导入项目（GitHub URL 或本地路径）
  - `DELETE /api/projects/:id` — 删除项目

## 数据流模式

**双模式运行：**

1. **API 模式（开发）** — `STATIC_MODE=false`
   - 前端通过 Nuxt API 路由查询 PostgreSQL
   - 支持实时导入新项目
   - 数据动态从数据库获取

2. **静态模式（生产/GitHub Pages）** — `STATIC_MODE=true`
   - 前端加载预构建的 `public/data/demo.bin`
   - 使用 pako 解压、列式 JSON 反序列化
   - 不支持实时导入，仅展示预置项目
   - 项目选择器从 staticBundle 获取项目列表

**静态数据构建流程：**
1. `pnpm build:bin` → 执行 `scripts/export-project-data.ts`
2. 克隆/更新 demo 仓库（vuejs/core, facebook/react, jquery/jquery, atom/atom）
3. 运行 Pipeline CLI 增量分析
4. 从数据库导出聚合数据
5. 转换为列式格式（columnar）压缩为 `demo.bin`

---

*集成审计：2026-04-23*
