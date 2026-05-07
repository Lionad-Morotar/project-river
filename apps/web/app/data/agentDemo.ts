/**
 * Agent 演示对话数据 — 从开发环境日志截取
 *
 * 用于 GitHub Pages 静态部署时展示 Agent 能力预览。
 * 对话内容来自真实的 jQuery 项目分析会话（projectId: 140）。
 */

/** 第一轮：问候 */
const round1User = {
  role: 'user' as const,
  text: '你好',
  parts: [{ type: 'text' as const, content: '你好' }],
}

const round1Assistant = {
  role: 'assistant' as const,
  text: '你好！我是 **project-river 的项目分析助手**，专门帮你理解这个项目的 Git 历史。目前我还没有获取到具体数据，请问你想了解什么？比如：\n\n- **项目整体时间线**（事件、里程碑）\n- **贡献者活跃度排名**\n- **某个模块（文件路径）是谁在修改**\n- **特定时间段的活动情况**\n\n请告诉我你的分析需求，我会调用工具来查询并给出基于 Git 数据的答案！',
  parts: [{
    type: 'text' as const,
    content: '你好！我是 **project-river 的项目分析助手**，专门帮你理解这个项目的 Git 历史。目前我还没有获取到具体数据，请问你想了解什么？比如：\n\n- **项目整体时间线**（事件、里程碑）\n- **贡献者活跃度排名**\n- **某个模块（文件路径）是谁在修改**\n- **特定时间段的活动情况**\n\n请告诉我你的分析需求，我会调用工具来查询并给出基于 Git 数据的答案！',
  }],
}

/** 第二轮：通用问题 + tool-call 演示 */
const round2User = {
  role: 'user' as const,
  text: '我可以问什么问题？',
  parts: [{ type: 'text' as const, content: '我可以问什么问题？' }],
}

const round2Assistant = {
  role: 'assistant' as const,
  text: '',
  parts: [
    {
      type: 'text' as const,
      content: '好的，让我先了解一下这个项目的基本情况，这样我可以给你更有针对性的建议。',
    },
    {
      type: 'tool' as const,
      toolCall: {
        id: 'call_demo_01',
        name: 'queryProjectEvents',
        input: {},
        output: {
          totalCount: 4,
          events: [
            { type: 'contributor_first_commit', date: '2006-03-22', title: '新贡献者加入', desc: 'jeresig@gmail.com 首次提交' },
            { type: 'project_start', date: '2006-03-22', title: '项目启动', desc: '首次提交于 2006-03-22' },
            { type: 'contributor_first_commit', date: '2006-05-11', title: '新贡献者加入', desc: 'gilles0181@gmail.com 首次提交' },
            { type: 'major_refactor', date: '2006-06-19', title: '大规模重构', desc: '单日删除 414 行代码' },
          ],
        },
        isError: false,
        status: 'done',
        index: 1,
        duration: 120,
      },
    },
    {
      type: 'text' as const,
      content: '好的，我已经了解了 project-river（jQuery 项目）的基本脉络。以下是你**可以问的问题类型**，每一类我都附上了示例：\n\n---\n\n## 📅 项目时间线类\n\n| 问题示例 | 涉及工具 |\n|---------|---------|\n| "项目什么时候开始的？" | `queryProjectEvents(typeFilter: project_start)` |\n| "历史上发生过哪些重大重构？" | `queryProjectEvents(typeFilter: major_refactor)` |\n| "贡献者加入/离开的高峰期是什么时候？" | `queryProjectEvents(typeFilter: contributor_first_commit / contributor_exit)` |\n| "项目活跃度的最高峰在哪段时间？" | `queryProjectEvents(typeFilter: activity_spike)` |\n| "项目什么时候达到 1000 次提交里程碑？" | `queryProjectEvents(typeFilter: commit_milestone)` |\n\n---\n\n## 🏆 贡献者分析类\n\n| 问题示例 | 涉及工具 |\n|---------|---------|\n| "谁提交代码最多？" | `queryContributors(sortBy: commits)` |\n| "最近谁还在活跃？" | `queryContributors(sortBy: recency)` |\n| "哪些贡献者的跨度最长（持续贡献时间）？" | `queryContributors(sortBy: span)` |\n| "某个时间段内有谁在贡献？" | `queryContributors(filter: { activeAfter, activeBefore })` |\n\n**示例数据**（来自项目）：排名前 3 的贡献者是 **John Resig** (1601 commits, 2006-2011)、**Timmy Willison** (764 commits, 2011-至今) 和 **Michał Gołębiowski-Owczarek** (546 commits, 2013-至今）。',
    },
    {
      type: 'tool' as const,
      toolCall: {
        id: 'call_demo_02',
        name: 'queryContributors',
        input: { sortBy: 'commits', limit: 10 },
        output: {
          totalCount: 349,
          contributors: [
            { name: 'John Resig', email: 'jeresig@gmail.com', commits: '1601', firstCommit: '2006-03-22', lastCommit: '2011-09-12', modules: ['test/unit', 'src/jquery', 'src/core.js', 'src/event.js', 'src/ajax.js'] },
            { name: 'Timmy Willison', email: 'timmywil@users.noreply.github.com', commits: '764', firstCommit: '2011-01-24', lastCommit: '2026-04-21', modules: ['test/unit', 'src/sizzle'] },
            { name: 'Michał Gołębiowski-Owczarek', email: 'm.goleb@gmail.com', commits: '546', firstCommit: '2013-04-22', lastCommit: '2023-05-18', modules: ['test/unit', 'src/core'] },
          ],
        },
        isError: false,
        status: 'done',
        index: 2,
        duration: 95,
      },
    },
    {
      type: 'text' as const,
      content: '---\n\n## 📂 文件/模块归属类\n\n| 问题示例 | 涉及工具 |\n|---------|---------|\n| "谁改过 `src/ajax.js`？" | `queryCommitsByPath(pathPrefix: "src/ajax.js")` + `queryContributors` |\n| "CSS 模块是哪些人在维护？" | `queryCommitsByPath(pathPrefix: "src/css")` + `queryContributors` |\n| "测试代码主要谁在写？" | `queryCommitsByPath(pathPrefix: "test/unit")` + `queryContributors` |\n| "某个文件最后一次修改是什么时候？" | `queryCommitsByPath(pathPrefix: "...", limit: 5)` |\n\n---\n\n## 🔀 组合查询（我的强项）\n\n我可以把多个工具的结果**交叉分析**。例如：\n\n- **"2020 年之后谁在维护 ajax 模块？"** → 先用 `queryCommitsByPath(pathPrefix: "src/ajax", dateRange: { start: "2020-01-01" })` 拿到 commits，再用 `queryContributors` 按提交数排序。\n- **"jQuery 核心团队有哪些人，各负责什么模块？"** → 结合 `queryContributors`（Top 10 的 modules 字段）和 `queryProjectEvents`（加入时间）。\n\n---\n\n## ❌ 我不能做什么\n\n1. **查不到就不编造** — 如果工具返回空，我会如实说"现有数据中查不到"。\n2. **不查贡献者个人状况** — 比如 LinkedIn、Twitter、个人新闻等，我不搜索这些。\n3. **结果超 100 条只展示 Top 20**，并会告知你结果已截断。\n\n---\n\n**你想从哪里开始？** 比如问项目历史、某个贡献者、某个模块的代码归属，都欢迎！',
    },
  ],
}

/** 预置的演示对话（两轮） */
export const agentDemoMessages = [
  round1User,
  round1Assistant,
  round2User,
  round2Assistant,
] as const
