# AGENTS.md

**project-river** 是一个交互式 Git 历史可视化工具，将仓库贡献者活动渲染为随时间流动的 Streamgraph（河流图）。用户通过 CLI 分析 Git 仓库，将数据持久化到 PostgreSQL，再通过 Nuxt v4 Web 应用进行探索。

- 现实层你有无限时间和资源，不要因上下文压缩简化任务执行

## 项目上下文

| 文档                                                    | 说明                         |
| ------------------------------------------------------- | ---------------------------- |
| [STACK.md](./.planning/codebase/STACK.md)               | 技术栈、开发命令、部署流程   |
| [INTEGRATIONS.md](./.planning/codebase/INTEGRATIONS.md) | 外部服务、环境变量、CI/CD    |
| [ARCHITECTURE.md](./.planning/codebase/ARCHITECTURE.md) | 架构模式、数据流、术语表     |
| [STRUCTURE.md](./.planning/codebase/STRUCTURE.md)       | 目录结构、monorepo 布局      |
| [CONVENTIONS.md](./.planning/codebase/CONVENTIONS.md)   | 代码风格、命名、lint 规范    |
| [TESTING.md](./.planning/codebase/TESTING.md)           | 测试框架、策略、示例         |
| [CONCERNS.md](./.planning/codebase/CONCERNS.md)         | 技术债务、风险、待改进       |
| [.impeccable.md](./.impeccable.md)                      | 品牌风格、设计理念、视觉方向 |

更新文档时优先更新到 `.planning/codebase/`。

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

## Design Context

### Users

**Primary:** 技术决策者（Engineering Managers、Tech Leads、开源维护者）。

**Context:** 他们需要快速评估项目健康度、识别核心贡献者、理解代码库随时间的演进节奏。

**Job to be done:** 从 Git 历史中提取可操作的洞察，做出人员分配、代码审查策略或项目方向上的决策。

### Brand Personality

**Voice:** 简洁、精确、低 ego。

**3-Word Personality:** 冷静（Calm）、可信（Trustworthy）、锋利（Sharp）。

**Emotional Goals:** 让用户感到数据是完全透明的，决策是有依据的——不制造焦虑，也不过度渲染。

### Aesthetic Direction

**Visual Tone:** 极简科技风，信息密度优先，线条干净，色彩克制。

**References:** GitHub Insights、GitLab Analytics、Vercel Dashboard 等开发者工具的数据面板。

**Anti-References:** 娱乐化/游戏化的数据大屏；过度使用渐变动效、霓虹色、浮夸装饰的界面。

**Theme:** 深色模式为主（slate 950/900/800 层次），D3 动态生成的贡献者配色作为唯一的高饱和度视觉焦点。

### Design Principles

1. **数据优先：** 任何 UI 装饰都不能干扰河流图的可读性；图表是主角，控件是配角。
2. **冷静克制：** 背景和结构色保持低饱和度，高饱和度仅赋予数据本身（贡献者线条、高亮状态）。
3. **可信透明：** 交互反馈即时，错误状态明确呈现，系统从不隐藏失败。
4. **密度适宜：** 技术用户需要一目了然，但信息排布需有呼吸感，避免视觉过载。
5. **流动即核心：** Streamgraph 的流动形态是产品的视觉灵魂，其他元素的造型和动效应与之和谐呼应。
