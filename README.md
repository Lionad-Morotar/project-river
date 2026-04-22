# Project River

将 Git 仓库贡献者活动渲染为随时间流动的 Streamgraph（河流图），帮助你快速评估项目健康度、识别核心贡献者、理解代码库演进节奏。

## 特性

- **河流图可视化**：D3 驱动的 Streamgraph，支持缩放、刷选、贡献者高亮
- **项目健康信号**：自动分析 Git 历史，生成可操作的健康洞察
- **事件时间线**：自动标记 release、重大变更等关键节点
- **多项目对比**：静态站点内置 vuejs/core、react、jquery、atom 四个示例项目
- **深色/浅色主题**：支持主题切换与 i18n（中文/英文）

## 如何运行

### 前置要求

- Node.js >= 18
- pnpm（包管理器）

### 安装依赖

```bash
pnpm install
```

### 开发模式（API + 数据库）

```bash
pnpm dev:web
```

开发服务器默认监听 `http://localhost:3000`，支持热重载。

### 静态站点模式

```bash
pnpm generate:gh
pnpm serve:pages
```

生成静态站点并本地预览，无需数据库。

### 构建生产版本

```bash
pnpm build:web
```

## 技术栈

- **前端**：Nuxt 4 + Vue 3 + TypeScript + Tailwind CSS
- **可视化**：D3.js（Streamgraph、Brush、Zoom）
- **包管理**：pnpm workspace monorepo
- **静态数据**：列式压缩 .bin 格式 + pako 解压

## 许可证

MIT
