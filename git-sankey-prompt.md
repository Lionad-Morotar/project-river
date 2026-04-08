# Git-Sankey：交互式 Git 历史可视化生成器

## 项目定位

为一个 Git 仓库生成交互式历史可视化网站的完整解决方案。**核心卖点是以河流图（Streamgraph）为主要交互载体的 Git 历史时间河流**，同时支持导出静态 SVG、PNG 和交互式 iframe，方便嵌入 README、文档或社交媒体分享。

目标用户包括开源项目维护者、企业团队、技术媒体创作者以及个人开发者。

---

## 一、核心功能：时间河流（Streamgraph）视图

### 1.1 页面布局
- 河流图占据页面主体，**从左到右水平延伸**
  - 最左侧 = 项目起始时间（`$start`，第一个 commit 的时间）
  - 最右侧 = 生成指令运行时刻（`$end`）
- 河流的"宽度"代表当月的活跃度可度量指标（默认为**贡献者数量**，可选切换为 merge 数、代码行变动数、提交数等项目）
- 河流可以分段，每段代表一个时间单位（按月聚合），视觉上形成一个连续的"水流"

### 1.2 X 轴标记系统
X 轴上方/下方需展示两类标记：

**A) Git Tag 标记**
- 解析仓库的 git tag，将 tag 位置标记在时间轴上
- 支持 `major` / `minor` / `patch` 的视觉区分

**B) 特殊事件里程碑标记**
在页面 X 轴上标记以下类型的事件（基于 calcMonth 的结果自动检测）：
- `first merge` — 项目首次出现 merge commit
- `most merges in a single month` — 单月 merge 数创历史新高
- `most contributors in a single month` — 单月贡献者数创历史新高
- `most lines changed in a single month` — 单月代码变动总量创历史新高
- `fewest contributors in a single month` — 单月贡献者数创历史新低（仅统计有提交的月份）
- 可扩展更多里程碑类型

### 1.3 时间选择器
- 允许用户按**月份**选中时间（`$selected`）
- 默认值为 `$end`（最新的月份）
- 实现方式：在河流图下方提供一个月份选择条（Month Brush），支持拖拽/点击选择
- 选中某月后，该高亮月份对应的河段在视觉上被强调（高亮色描边/发光）

---

## 二、选中月份后的详情面板

当用户选中某个 `$selected` 月份时，页面右侧（或下方弹层）展示一个**漂亮排版的表单面板**，以 [git-history.jpalmer.dev](https://git-history.jpalmer.dev/) 的表单设计为美学参考，展示：

### 2.1 月度数据（Current）
```
July 2005

Changes
312
Average 10/day

Merges
8
3% of commits

Contributors
18
7 new

Daily Changes
40
Lines Added
11,918
Average 384/day
Lines Removed
3,660
Average 118/day
Daily Lines Added/Removed
≥2,200

Top Contributors
Linus Torvalds     131
Junio C Hamano      81
Sven Verdoolaege    17
...
```

### 2.2 累计数据（Cumulative）
```
Cumulative
Changes        1.27k     (3% of 46.1k total)
Merges            19     (<1% of 15.6k total)
Contributors      52     (3% of 1,923 total)
Lines Added    65.4k     (2% of 2.63M total)
Lines Removed  23.1k     (2% of 1.54M total)
```

### 2.3 视觉要求
- 大数字使用醒目的等宽字体（Monospace）
- 标签/说明文字使用较小的辅助字体
- 数字变化支持 Count-up 动画
- 整体采用卡片式分栏布局
- Top Contributors 列表展示头像（如有）+ 名称 + 贡献数

---

## 三、河流图（Streamgraph）核心设计

### 3.1 "层"的语义
河流图的每一层彩带代表一个分类维度在时间轴上的贡献量变化。默认设计为：

**默认模式：贡献者维度**
- X 轴 = 时间（按月或按季度聚合）
- Y 轴 = 堆叠的贡献量（总高度 = 该时间单位的总活跃度）
- 每一层彩带 = 一个贡献者
- 彩带厚度 = 该贡献者在该时间单位的贡献权重（commit 数或代码行变动）

**可选切换模式：文件类型维度**
- 用户可以通过界面切换分层维度
- 例如按文件扩展名分类（`ts`、`md`、`vue` 等）
- 每一层彩带 = 一种文件类型

### 3.2 交互
- **Hover 某一层彩带**：高亮该 contributor/file-type 在所有时间点的轨迹，显示 Tooltip（ contributor 名称、月份、贡献量）
- **点击河流的某一段（某个月份）**：选中该月份，高亮显示垂直时间切片，同时激活详情面板
- **点击某一层彩带**：可选中对应的贡献者/文件类型，进入贡献者详情视图

---

## 四、贡献者详情视图

当选中某个具体贡献者时，展示一个独立的详情面板或跳转页面，包含：

### 4.1 基础信息
- 头像（优先 GitHub Avatar API，回退 Gravatar identicon，再回退默认头像）
- 贡献者名称 / email
- "XRD Contributor" 或其他有趣的统计标签

### 4.2 双 Series 柱状图
- 展示该贡献者从**首次提交到 `$end`** 的代码贡献历史
- **双 series 柱状图**：正方向（向上/向右）表示新增代码量，负方向（向下/向左）表示删除代码量
- X 轴为时间，可按天/月/年聚合（默认按月）
- 风格：D3 实现的双向柱状图（Diverging Bar Chart）

### 4.3 数字分栏（Contributor Stats Grid）
显示以下指标：
- Total Commits
- Lines Added
- Lines Deleted
- Active Days
- Files Changed
- First Commit Date / Last Commit Date

### 4.4 24 小时提交时间偏好
- 使用 D3 实现的**极坐标柱状图（Radial Bar Chart）**
- 24 个小时映射为 360°，每根柱子的高度代表该小时的提交次数
- 中心圆显示 Total Commits 和 Peak Hour
- 配色根据时间段渐变（深夜→凌晨→上午→下午→晚上）

---

## 五、数据生成与计算管道

### 5.1 执行方式
- **一次性分析脚本**：用户手动运行命令分析一个 Git 仓库
- 脚本语言：**TypeScript + Bun**
- 按天循环执行，不可跳过中间日期

### 5.2 Git 数据提取
使用原生 `git log` 命令提取结构化数据：
```bash
git log --all --format='%H|%h|%an|%ae|%ad|%s|%b|%P' --date=unix --numstat --reverse
```
需要提取的信息：
- commit hash, short hash, 作者名, 作者邮箱, 作者日期
- 提交标题、body
- 父 commit（用于识别 merge commit）
- 每个文件的新增/删除行数、文件路径、扩展名

### 5.3 calcDay 算法
按天循环执行，输入为当天所有 commits，输出为当天的统计结果，存入 `daily_stats` 表：
- `commit_count`：提交数
- `merge_count`：merge commit 数
- `additions` / `deletions`：新增/删除行数
- `new_contributors`：当日首次贡献的人数
- `cumulative_contributors`：截至当日的累计贡献者总数
- `top_contributors`：当日 Top 10 贡献者（jsonb 存储）
- `file_types`：当日文件类型分布（jsonb 存储）
- `commit_hashes`：当日所有 commit 的 hash 列表

### 5.4 calcMonth 算法
在 calcDay 执行完毕后，按月汇总，存入 `monthly_stats` 表。每个月输出：
- `total_commits`, `total_merges`, `total_additions`, `total_deletions`
- `monthly_contributors`：该月有多少独立贡献者
- `new_contributors_this_month`：该月新增贡献者数
- 检测并生成本月里程碑事件，存入 `milestones` 表

### 5.5 sumDay 累加表
新建 `sum_day` 表用于存储**滚动累加值**：
- 第 1 天的累加值 = calcDay 第 1 天的结果
- 第 2 天的累加值 = sumDay 第 1 天 + calcDay 第 2 天
- 第 N 天的累加值 = sumDay 第 N-1 天 + calcDay 第 N 天

字段包含：
- `summary_date`：日期（主键）
- `daily_commits` / `daily_merges` / `daily_additions` / `daily_deletions`：当日原始值
- `cumulative_commits` / `cumulative_merges` / `cumulative_additions` / `cumulative_deletions`：截至该日的累计值
- `cumulative_contributors`：截至该日的累计独立贡献者数
- `cumulative_net_lines`：累计净代码行数（additions - deletions）

### 5.6 数据库 Schema（PostgreSQL）

```sql
-- 项目信息
projects (id, name, git_url, default_branch)

-- 原始提交数据
commits (id, project_id, hash, short_hash, author_name, author_email, author_date, subject, body, parents, is_merge, additions, deletions, files_changed)

-- 提交文件变更明细
commit_files (id, commit_id, file_path, file_extension, additions, deletions)

-- 作者维度表
authors (id, project_id, email, name, avatar_url, first_commit_date, last_commit_date, total_commits, total_additions, total_deletions)

-- 日统计（calcDay 结果）
daily_stats (id, project_id, date, commit_count, merge_count, additions, deletions, new_contributors, cumulative_contributors, cumulative_commits, cumulative_merges, cumulative_additions, cumulative_deletions, cumulative_net_lines, top_contributors, file_types, commit_hashes)

-- 月统计（calcMonth 结果）
monthly_stats (id, project_id, year, month, total_commits, total_merges, total_additions, total_deletions, total_net_change, monthly_contributors, new_contributors_this_month)

-- 里程碑事件
milestones (id, project_id, type, detected_at, value, description, context)

-- 日累加（sumDay 结果）
sum_day (id, summary_date, daily_commits, daily_merges, daily_additions, daily_deletions, cumulative_commits, cumulative_merges, cumulative_additions, cumulative_deletions, cumulative_contributors, cumulative_net_lines)

-- 文件类型统计
file_type_stats (id, project_id, date, file_extension, file_count, additions, deletions)

-- 每日贡献者排名
daily_contributor_rankings (id, project_id, date, author_email, rank, commits, additions, deletions)
```

---

## 六、技术架构

### 6.1 整体架构
```
monorepo/
├── apps/
│   └── web/                  # Nuxt v4 前端应用
├── packages/
│   ├── api/                  # 数据处理脚本（Bun + TS）
│   ├── db/                   # 数据库 schema + ORM 封装
│   ├── ui/                   # 共享 UI 组件（可选）
│   └── charts/               # D3 图表封装（可选）
├── pnpm-workspace.yaml
└── turbo.json
```

### 6.2 前端技术栈
- **框架**：Nuxt v4（`future.compatibilityVersion: 4`）
- **UI 库**：Nuxt UI **v4**（兼容 Nuxt v4 的官方版本）
- **工具库**：VueUse 全家桶
- **样式**：Tailwind CSS v4
- **图表**：D3.js（d3-scale, d3-shape, d3-selection, d3-array 等模块化使用）
- **主题**：**仅白天模式**，低饱和度 + 高亮色点缀

### 6.3 后端/脚本技术栈
- **运行时**：Bun
- **语言**：TypeScript
- **包管理器**：pnpm
- **数据库**：PostgreSQL
- **ORM**：Drizzle ORM（推荐）或 Kysely
- **Git 解析**：原生 `git log` 命令（通过 `child_process` 调用）

### 6.4 低饱和度视觉设计系统

**主色调（Muted Pastel + Sage）**：
- 背景：`#fafcfb`（轻微暖白）
- 卡片：`#f4f3f0`
- 边框：`#e8e6e1`
- 次级文字：`#8a8078`
- 主文字：`#413c39`

**数据可视化分类色**：
- `#bdd0c4`（Sage Green）
- `#9ab7d3`（Dusty Blue）
- `#f5d2d3`（Blush Pink）
- `#e3bbbb`（Muted Rose）
- `#bccad6`（Slate Blue）
- `#c4b7d4`（Lavender Gray）

**高亮色（单点突破）**：
- 主高亮/选中：`#087f8c`（Teal）
- 次高亮/负增长：`#d3674a`（Terracotta）
- 操作/链接：`#0096c9`（Cerulean）

---

## 七、导出与分享

### 7.1 导出形式
网站需要支持以下导出：
1. **静态 SVG**：可嵌入 README、文档
2. **静态 PNG**：适合社交媒体分享
3. **交互式 iframe**：可嵌入网页，保留 hover/click 交互

### 7.2 实现建议
- SVG 导出：利用 D3 的 SVG DOM 直接序列化
- PNG 导出：通过 `html2canvas` 或 `dom-to-image` 将 SVG 渲染为 PNG
- iframe 导出：前端提供一个独立的 `/embed/:projectId` 路由，生成 iframe 嵌入代码

---

## 八、初始实现范围

**第一阶段（最小可用）**：
1. 初始化 pnpm workspace + Nuxt v4 前端 + packages/db
2. 实现 `git log` 解析器（packages/api）
3. 实现 calcDay 和 sumDay 算法，写入 Postgres
4. 实现基础版河流图（Streamgraph，默认按贡献者维度分层）
5. 实现月份选择器和月度详情面板
6. 支持导出 SVG

**第二阶段**：
1. 实现 calcMonth 和里程碑检测
2. 实现 X 轴 Git Tag 和里程碑标记
3. 实现文件类型维度切换
4. 实现贡献者详情视图（头像、双 series 图、24h 图）
5. 支持 PNG 和 iframe 导出
6. 完善动画和视觉细节

---

## 九、关键约束

- 前端仅支持**白天模式**，不使用深色主题
- 图表必须使用 **D3 全家桶**实现，不引入高层图表库（如 ECharts, Chart.js）
- 数据必须**按天顺序计算并落库**，不允许跳过日期
- 项目目标仓库规模为**中型（10k-100k commits）**，性能需在此量级下流畅
- 使用 **pnpm workspace** 管理子包
- **不引入 Nuxt UI v3**，直接使用 v4 以确保 Nuxt v4 兼容性
