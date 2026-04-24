# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-24

### Added

- **Streamgraph 河流图可视化** — D3 驱动的交互式贡献者活动流图，支持缩放、刷选、hover 高亮
- **GitHub 仓库导入** — 通过 GitHub URL 克隆并分析完整 Git 历史
- **本地 Git 仓库导入** — 支持本地路径直接导入分析
- **静态模式** — 无需 PostgreSQL 服务端，浏览器端加载预打包的 demo.bin 数据
- **列式压缩数据格式** — 静态数据包体积优化 -36%
- **i18n 全站国际化** — 中英双语支持，完整翻译覆盖
- **主题系统** — 深色/亮色模式切换 + 多套可切换配色方案
- **项目事件检测** — 自动识别 Release、归档、活跃度变化等关键事件
- **Top-N 贡献者选择器** — 动态调整显示的贡献者数量（支持自定义数值）
- **数据聚合粒度控制** — Day / Week / Month 三档粒度切换
- **SVG 导出** — 导出高质量矢量图，含图例与健康摘要
- **健康摘要** — 基于规则引擎的项目健康度分析（活跃度、贡献集中度等）
- **月环比指标** — 月度贡献趋势对比
- **GitRiverCanvas 背景动画** — 首页全屏河流背景 + 滚动模糊效果
- **View Transition 动效** — 主题/语言切换时的平滑过渡动画
- **GitHub Pages 自动部署** — CI/CD 工作流，STATIC_MODE 构建 + deploy-pages

### Changed

- 许可证从 MIT 更改为 BSL 1.1
- 视觉风格统一为玻璃拟态（Glassmorphism）+ Nuxt UI v4 语义令牌
- 导航精简为单一页面架构，首页与项目详情整合
- 面板布局调整为 chart:panel 1:2 比例，内部双栏 1:1

### Fixed

- Streamgraph 缩放/刷选边界问题与交互稳定性
- 面板拖拽布局卡死与高度初始化防重入
- Tooltip 定位溢出与边界处理
- SVG 导出尺寸、深色背景与图例适配
- 贡献者精确计数（后端 contributorCount + 静态 bundle 统一）
- 事件标记日期对齐当前粒度
- Streamgraph x 轴层级渲染顺序

### Removed

- 废弃的独立导航代码与 Stats grid 展示
