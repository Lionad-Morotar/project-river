# Project River

**[English](./README.md)** | 中文

将 Git 仓库贡献者活动渲染为随时间流动的 Streamgraph（河流图），帮助你快速评估项目健康度、识别核心贡献者、理解代码库的演进节奏。

![landing](./assets/landing.gif)

## 特性

- **河流图可视化** — D3 驱动的 Streamgraph，支持缩放、刷选导航、贡献者高亮
- **项目健康信号** — 自动分析 Git 历史，输出贡献集中度、活跃度变化等可操作洞察
- **事件时间线** — 检测项目里程碑、核心贡献者变动等关键节点
- **深浅色主题** — 主题切换、可配置配色方案与 i18n（中文 / English）

![project-detail](./assets/project-detail.png)

## 在线体验

推荐直接访问 [GitHub Pages](https://lionad-morotar.github.io/project-river/) 在线体验。

线上版本为静态部署，仅展示预置的演示数据。如需分析自己的仓库，请按下方步骤本地部署。

## 本地部署

### 前置条件

- [Node.js](https://nodejs.org/) ≥ 20（需 ESM 支持）
- [pnpm](https://pnpm.io/) ≥ 9
- [Docker](https://www.docker.com/)（用于运行 PostgreSQL）
- [Git](https://git-scm.com/)（分析目标仓库时需要）
- [Bun](https://bun.sh/)（运行 CLI 分析脚本）

### 1. 启动数据库

```bash
docker compose up -d
```

这会启动两个容器：

| 服务          | 端口   | 用途                     |
| ------------- | ------ | ------------------------ |
| PostgreSQL 16 | `5432` | 主数据库                 |
| pgAdmin 4     | `5050` | 数据库可视化管理（可选） |

### 2. 配置环境变量

在项目根目录创建 `.env` 文件：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/river
```

### 3. 安装依赖 & 运行迁移

```bash
pnpm install
pnpm db:migrate
```

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:10400 即可使用。

### 5. 分析仓库

使用页面添加新项目，或通过 CLI 导入并分析 Git 仓库：

```bash
# 分析本地仓库
bun packages/pipeline/src/cli.ts /path/to/repo owner/repo

# 增量更新已有项目
bun packages/pipeline/src/cli.ts /path/to/repo owner/repo --incremental

# 强制重新分析
bun packages/pipeline/src/cli.ts /path/to/repo owner/repo --force
```

分析完成后刷新页面即可看到河流图。

## 技术栈

- **前端** — Nuxt 4 · Vue 3 · TypeScript · Tailwind CSS v4
- **可视化** — D3.js（Streamgraph · Brush · Zoom）
- **数据库** — PostgreSQL 16 · Drizzle ORM
- **包管理** — pnpm workspace monorepo
- **静态部署** — 列式压缩 `.bin` 格式 + pako 解压

## 许可证

[Business Source License 1.1](./LICENSE) — 个人使用免费，商业使用需授权。

2029-01-01 后自动转为 MIT 许可证。

## 致谢

受 [The Git Distributed Version Control System](https://git-history.jpalmer.dev/) 启发。
