# 代码库关注点

**分析日期：** 2026-04-09

## 安全

### .gitignore 未排除 .env 和构建产物

- **严重性：** 关键
- **文件：** `.gitignore`
- **问题：** `.gitignore` 仅包含 `.planning/`、`node_modules` 和 `.DS_Store`。**不**排除：
  - `.env` — 环境配置文件（可能包含数据库凭据）
  - `apps/web/.nuxt/` — 生成的 Nuxt 构建缓存
  - `apps/web/.output/` — 编译后的生产构建（包含打包的服务端代码和嵌套的 node_modules）
  - `dist/` — 任何未来的构建产物
- **影响：** 包含 `DATABASE_URL` 等密钥的 `.env` 可能被提交到 git。构建产物会膨胀仓库体积并泄露实现细节。
- **修复方案：** 在 `.gitignore` 中添加 `.env`、`.env.*`、`*.local`、`.nuxt/`、`.output/`、`dist/`。从 git 历史中移除任何已提交的 `.output/` 或 `.nuxt/` 目录。

### docker-compose.yml 中硬编码默认凭据

- **严重性：** 高
- **文件：** `docker-compose.yml`
- **问题：** PostgreSQL 密码为 `postgres`，pgAdmin 凭据为 `admin@localhost.com` / `admin`。这些作为默认值提交到源码控制中。
- **影响：** 若此 docker-compose 用于任何共享或网络可访问环境，数据库将可被轻易访问。
- **修复方案：** 使用环境变量插值（`${POSTGRES_PASSWORD:-postgres}`），使默认值仅限本地使用；或在文档中说明 docker-compose.yml 使用前需通过 `.env` 覆盖。

### API 端点无认证

- **严重性：** 中（目前仅为本地工具，但阻碍任何生产用途）
- **文件：** `apps/web/server/api/projects/[id]/daily.get.ts`、`apps/web/server/api/projects/[id]/monthly.get.ts`
- **问题：** 所有 API 端点均可公开访问。任何客户端都可读写项目数据。CLI 直接写入数据库，完全绕过 API，因此整个系统没有任何认证层。
- **影响：** 若 Nuxt 应用被部署或暴露到网络，任何用户都可查询所有项目数据。
- **修复方案：** 添加 API Key 或基于会话的认证中间件。至少应在文档中声明应用仅限本地使用。

### repoPath 无输入校验

- **严重性：** 低-中
- **文件：** `packages/pipeline/src/cli.ts`、`packages/pipeline/src/db/analyze.ts`
- **问题：** CLI 接受 `repoPath` 参数并直接传递给 `git -C <repoPath>`，未做任何验证。无路径遍历保护。
- **影响：** 恶意或误输入的 `repoPath`（如 `../../.ssh`）可能导致工具分析非预期目录。
- **修复方案：** 验证路径为有效 Git 仓库，可选限制为用户主目录或白名单。

## 技术债务

### Streamgraph 组件中过多的 `any` 类型

- **严重性：** 中
- **文件：** `apps/web/app/components/Streamgraph.vue`（第 63-76 行）
- **问题：** 变量 `gChart`、`gXAxis`、`gYAxis`、`gBrushGroup`、`brushGroup`、`xBase`、`xScale`、`yScale`、`zoomBehavior`、`brushBehavior`、`areaGenerator`、`layers`、`monthHighlight` 全部类型为 `any`。D3 的 `select`、`append` 和选择链完全丢失类型信息。
- **影响：** D3 API 使用无编译时安全保障。升级 D3 版本易出错。IDE 自动补全失效。
- **修复方案：** 从 `d3-selection`、`d3-scale`、`d3-zoom`、`d3-brush` 导入并使用 D3 的 `Selection`、`ScaleTime`、`ScaleLinear`、`ZoomBehavior`、`BrushBehavior` 类型。

### 原始 SQL 模板缺乏类型安全

- **严重性：** 中
- **文件：** `apps/web/server/api/projects/[id]/daily.get.ts`（第 26-59 行）、`apps/web/server/api/projects/[id]/monthly.get.ts`（第 26-58 行）
- **问题：** API 端点使用原始 `sql\`\`` 模板字符串，而非 Drizzle 查询构造器。结果行类型为 `any`，手动映射。
- **影响：** 列名拼写错误或 Schema 变更不会在编译时被捕获。SQL 注入已通过 Drizzle 参数化查询缓解，但缺乏 Schema 级校验。
- **修复方案：** 尽可能迁移到 Drizzle 查询构造器，或使用类型化的结果接口替代 `any`。

### PivotedRow 接口使用索引签名

- **严重性：** 低
- **文件：** `apps/web/app/utils/d3Helpers.ts`（第 13-16 行）
- **问题：** `PivotedRow` 使用 `[contributor: string]: number | Date` 索引签名，允许任意键名，丢失类型安全。拼写错误的贡献者名称也能通过编译。
- **影响：** 贡献者名称查找失败时在运行时无声出错。
- **修复方案：** 对动态贡献者字段使用 `Record<string, number>`，或在内部使用 Map。

### 隐式依赖 Nuxt 自动导入

- **严重性：** 低
- **文件：** `apps/web/app/components/MonthSelector.vue`
- **问题：** `computed` 未显式从 `vue` 导入即可使用，因为 Nuxt 自动导入。但这降低了可移植性，使组件更难提取为独立库或在 Nuxt 外测试。
- **影响：** 组件更难隔离测试，新开发者也难以理解函数来源。
- **修复方案：** 为清晰起见添加显式 `vue` 导入，或文档化自动导入约定。

## 脆弱区域

### 测试依赖真实 PostgreSQL 且静默跳过

- **严重性：** 中
- **文件：** `apps/web/server/api/projects/[id]/daily.get.test.ts`、`apps/web/server/api/projects/[id]/monthly.get.test.ts`、`packages/pipeline/tests/cli.test.ts`
- **问题：** 集成测试检查 `process.env.DATABASE_URL`，若缺失则跳过单个测试。每日测试套件有 4 个测试但仅 2 个可在无数据库时运行。CLI 测试则完全 Mock 了 `analyzeRepo`。
- **影响：** CI 可能报告"所有测试通过"，即使实际没有运行任何数据库集成测试。没有真实数据库时测试覆盖率是虚假的。
- **修复方案：** 添加基于 testcontainers 的 PostgreSQL 夹具或 Mock 数据库层。至少在 `DATABASE_URL` 未设置时让测试套件失败，而非静默跳过。

### `generateSumDay` 每次运行都重新计算所有累计数据

- **严重性：** 中
- **文件：** `packages/pipeline/src/db/sumDay.ts`、`packages/pipeline/src/db/analyze.ts`（第 152 行）
- **问题：** 每次 `--incremental` 运行后，`generateSumDay` 删除项目的所有累计数据并从头重新计算，扫描整个 `daily_stats` 表。
- **影响：** 随仓库增长，增量分析变得越来越慢，因为它重新处理所有历史数据而非仅新提交。对于有数千天历史的大型仓库，这可能耗时显著。
- **修复方案：** 增量模式下仅追加最后已有日期之后的新累计值。使用 `MAX(date)` 找到截止点。

### `--incremental` 模式将所有提交哈希加载到内存

- **严重性：** 低-中
- **文件：** `packages/pipeline/src/db/analyze.ts`（第 56-62 行）
- **问题：** 增量模式将数据库中的每个提交哈希都选入一个 `Set<string>`。对于有数十万提交的大型仓库，这可能消耗大量内存。
- **影响：** 超大型仓库可能出现内存耗尽。
- **修复方案：** 使用数据库级检查或分批加载哈希集合。

## 性能瓶颈

### Streamgraph 每次 Prop 变更都全量重渲染

- **严重性：** 中
- **文件：** `apps/web/app/components/Streamgraph.vue`（第 280-290 行）
- **问题：** 对 `width`、`height` 和 `data` 的 watchers 都触发完整的 `render()`，清空 SVG 并从零重建每个元素。即使数据仅轻微变化，整个图表也被销毁重建。
- **影响：** 数据更新时可见闪烁。大数据集（多日期 + 多贡献者）性能差。
- **修复方案：** 实现增量更新 — 修改现有 SVG 元素而非清空重建。使用 D3 的 data-join 模式实现平滑过渡。

### API 查询构建完整的日期×贡献者网格

- **严重性：** 低-中
- **文件：** `apps/web/server/api/projects/[id]/daily.get.ts`（第 35-43 行）、`apps/web/server/api/projects/[id]/monthly.get.ts`（第 35-43 行）
- **问题：** 两个查询都生成日期×贡献者的全量笛卡尔积网格，然后 LEFT JOIN 实际数据。对于贡献者众多、历史悠久的仓库，这个网格会变得非常大。
- **影响：** 内存使用和查询时间按 O(日期 × 贡献者) 缩放，而非 O(实际数据点)。
- **修复方案：** 使用仅返回有数据行的高效查询，让前端按需填补空缺。

## 未完成功能

### 无项目管理 UI

- **严重性：** 低
- **文件：** `apps/web/app/pages/projects/[id]/index.vue`
- **问题：** 唯一页面是 `/projects/[id]/index.vue`。没有项目浏览列表页、项目创建 UI 或项目删除功能。项目只能通过 CLI 创建。
- **影响：** 用户必须知道数字项目 ID 才能查看数据。无法通过 Web UI 发现或管理项目。
- **修复方案：** 添加 `/projects` 索引页列出所有项目并提供链接。添加项目创建/删除 UI。

### 无错误边界或重试逻辑

- **严重性：** 低
- **文件：** `apps/web/app/pages/projects/[id]/index.vue`（第 67-84 行）
- **问题：** API 失败时被捕获并显示通用的"Failed to load project data"消息。无重试按钮，不区分 404、500 或网络错误。未配置 Vue 错误边界。
- **影响：** 用户无法区分"项目不存在"和"服务器宕机"。无法在不刷新页面的情况下重试。
- **修复方案：** 为每种 HTTP 状态码添加具体错误消息。添加重试按钮。配置 Nuxt 错误边界。

### 图表 Resize 无加载状态

- **严重性：** 低
- **文件：** `apps/web/app/pages/projects/[id]/index.vue`（第 57-61 行）
- **问题：** `updateChartWidth` 在挂载和窗口缩放时调用，但存在竞态条件：数据获取可能在初始宽度计算完成前完成，导致首次渲染使用默认的 1024 宽度。
- **影响：** 页面加载时短暂视觉闪烁——图表以错误宽度渲染后重新渲染。
- **修复方案：** 在触发数据获取前计算宽度，或延迟数据获取直到宽度已知。

## 缺失关键功能

### 无 CI/CD 管线

- **严重性：** 中
- **文件：** 无（无 `.github/`、`.gitlab-ci.yml` 等）
- **问题：** 无 CI/CD 配置。无自动化测试运行、无推送时的 lint 检查、无部署管线。
- **影响：** 代码可在未验证的情况下被合并。无回归检测。
- **修复方案：** 添加 GitHub Actions 或等效工作流，用于 lint、测试和构建检查。

### 无数据库迁移文档或种子脚本

- **严重性：** 低
- **文件：** `packages/db/drizzle.config.ts`、`packages/db/src/schema/`
- **问题：** Schema 变更由 Drizzle 迁移管理，但迁移工作流没有文档。无种子脚本填充开发测试数据。
- **影响：** 新开发者必须手动设置数据库并运行 CLI 才能获得数据。
- **修复方案：** 添加种子脚本，文档化 `db:generate` / `db:migrate` 工作流。

## 已知空白

### 无 Vue 组件级测试

- **严重性：** 低
- **文件：** `apps/web/app/components/Streamgraph.vue`、`MonthDetailPanel.vue`、`MonthSelector.vue`、`pages/projects/[id]/index.vue`
- **问题：** 不存在组件级测试。所有 Vue 组件和页面均未测试。仅工具函数（`d3Helpers`、`monthDetailHelpers`、`svgExport`、`useContributorColors`）有单元测试。
- **影响：** 组件回归无法被捕获。交互行为（拖拽、缩放、刷选）未测试。
- **优先级：** MonthDetailPanel 为中（逻辑复杂），Streamgraph 为低（D3 集成测试困难）。

### 无 E2E 测试

- **严重性：** 低
- **文件：** 无
- **问题：** 无端到端测试。整个用户旅程（CLI 分析 → 数据库 → Web 可视化）作为集成流程未测试。
- **影响：** 管线到 UI 的交接环节断裂不会被检测到。
- **优先级：** 当前本地范围下为低。部署后为中。

---

*关注点审计：2026-04-09*
