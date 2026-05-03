# Roadmap

## Project

project-river — interactive Git history Streamgraph visualization.

## In Progress — v0.2.0 Agentic QA

**Started:** 2026-04-27
**Goal:** 在河流图 + 确定性事件之上加一层 ReAct agent，用户用自然语言提问，agent multi-step tool calling 给出**带证据**的答案。
**Source design:** [`docs/design/agent.md`](../docs/design/agent.md) (APPROVED 9/10)
**Time box:** ~16h weekend + ≤1h pre-flight gate
**Constraints:** dynamic mode only · 无外部网络 · pi-mono 0.70.2 locked exact · fail → Vercel AI SDK pivot

### Phases

- [ ] **Phase 1: Pre-flight 与 Schema (Foundation)** — P0 spike + commit_files schema 验证，验证系统能跑 ReAct loop
- [ ] **Phase 2: Tools 纯函数层 (Tool Layer)** — detectProjectEvents pure-lib 抽离 + 3 个 zod-typed tools + 单元测试
- [ ] **Phase 3: Agent 引擎与路由 (Agent Engine)** — pi-mono ReAct loop + SSE route + system prompt + integration/route 测试
- [ ] **Phase 4: 聊天 UI 与 i18n (Chat Surface)** — AgentChat USlideover + UI States + 5 chip + 中英 i18n + component 测试
- [ ] **Phase 5: Eval 验证闸门 (Sunday-Night Gate)** — VueUse ingest + hardest test + chip eval + Playwright E2E

### Phase Details

#### Phase 1: Pre-flight 与 Schema (Foundation)
**Goal:** 验证 pi-mono 在 Nuxt 4 SPA + Nitro SSE 链路可用，并把数据层 schema 准备好
**Depends on:** Nothing (entry phase)
**Requirements:** PRE-01, INFRA-03
**Success Criteria** (what must be TRUE):
  1. 开发者可以从 client `EventSource` 接收 pi-mono 流式 token，无 buffering 也无 SSR/CSR error（P0 PASS）；如果 P0 FAIL，pivot plan 已记录、weekend 开局即换 Vercel AI SDK
  2. `commit_files` JOIN 表 schema 已确认存在或 migration 已落地，`prefix%` LIKE 查询能走 btree index
**Plans:** 2 plans in 1 wave

Plans:
- [x] 01-001-sse-spike-PLAN.md — pi-mono + Nuxt 4 SSE hello-world spike (P0 hard gate)
- [x] 01-002-schema-index-PLAN.md — commit_files schema verification + btree index decision

**Wave 1 (parallel):** PRE-01 + INFRA-03 一起跑，互相不 blocking
**Pivot guard:** PRE-01 是 hard gate — fail 不进入 Phase 2，直接走 Vercel AI SDK 路线

#### Phase 2: Tools 纯函数层 (Tool Layer)
**Goal:** 抽离 detectProjectEvents pure-lib + 三个与框架解耦的 typed tools 落地，agent 之外任何消费方均可复用
**Depends on:** Phase 1 (INFRA-03 schema, PRE-01 gate)
**Requirements:** INFRA-04, TOOL-01, TOOL-02, TOOL-03, TEST-01
**Order inside phase:** 先 INFRA-04 (Lane C refactor 完成后再启动 Lane A)，再 TOOL-* + TEST-01
**Success Criteria** (what must be TRUE):
  1. Server-side 代码可以直接 `import { detectProjectEvents } from '...'` 调用纯函数，无需 Web Worker context（INFRA-04, Lane C 完成）
  2. 调用 `queryContributors` 能按 commits/recency/span 排序返回贡献者列表（含 active 窗口、modules 路径段），zod schema 校验入参
  3. 调用 `queryProjectEvents` 返回 Apr 21 design 的 7 类 `ProjectEvent`，且事件数据与现有 `useProjectEvents` 输出一致
  4. 调用 `queryCommitsByPath` 用 prefix-only LIKE JOIN `commit_files` 拿到 commits（message 截断 200 字符），large result 按 limit 截断
  5. 三个 tool 各有单元测试覆盖 happy path + 空结果 + 截断/越界边界，全部 pass
**Plans:** 2 plans in 2 waves

Plans:
- [x] 02-01-PLAN.md — INFRA-04: detectProjectEvents 纯函数抽取 + worker 精简 + 纯函数测试
- [x] 02-02-PLAN.md — TOOL-01/02/03: 3 个 zod-typed tools + barrel registry + TEST-01 单元测试

**Wave 1:** 02-01 (INFRA-04 纯函数抽取)
**Wave 2:** 02-02 (tools + tests，依赖 02-01 的 detectProjectEvents 导出)

#### Phase 3: Agent 引擎与路由 (Agent Engine)
**Goal:** pi-mono ReAct loop 通过 SSE route 把 token + tool-call event 推到 client，error graceful degrade
**Depends on:** Phase 2 (tools registry)
**Requirements:** AGENT-01, AGENT-02, AGENT-03, AGENT-04, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. 开发者向 `POST /api/projects/[id]/agent` 发起请求时，能收到顺序正确的 SSE 事件流：`text` → `tool-call` → `tool-result` → `done`
  2. Agent 在 path-based 问题（如 "auth 模块谁接手"）上自动触发 ≥ 2 步 tool calling，符合 P2 修订标准
  3. Tool 抛错时 client 不收到崩溃响应，agent 继续运行并将 error 反馈给 LLM 做 graceful degrade
  4. System prompt（中英双语）已包含 "result too large" 截断约束，integration test mock LLM 验证 ReAct loop 与 tool error 反馈链路
**Plans:** 2 plans in 2 waves

Plans:
- [x] 03-01-PLAN.md — AGENT-01/02/03/04: systemPrompt + toolAdapters + createAgent + SSE route
- [x] 03-02-PLAN.md — TEST-02/03: Agent integration test (mock LLM) + Route test (SSE event sequence)

**Wave 1:** 03-01 (engine + route 落地)
**Wave 2:** 03-02 (tests，依赖 03-01 的导出)

#### Phase 4: 聊天 UI 与 i18n (Chat Surface)
**Goal:** 用户从项目详情页打开 slide-in drawer，问问题、看流式回答、展开 tool-call cards、命中所有 UI States
**Depends on:** Phase 3 (SSE route contract stable)
**Requirements:** UI-05, UI-06, UI-07, UI-08, I18N-01, TEST-04
**Success Criteria** (what must be TRUE):
  1. 用户点击 ProjectLayout 头部 "Ask" 按钮，能从右侧 slide in 一个 40% 宽 drawer（mobile 全屏 fallback），关闭/重开状态保持
  2. 用户可以点击 5 个中英 chip questions 任一个自动填充并发送，drawer 中流式渲染 token，tool-call cards 默认折叠、可展开看 input/output JSON
  3. 用户在 idle/streaming/tool-calling/stream-mid-error/abort/rate-limit/cost-cap/input-too-long/api-key-missing/empty-result 任一状态下都能看到明确反馈
  4. 用户切换中英 locale 时 drawer 标题、placeholder、5 chip、error、tool-card 标签全部跟随翻译
  5. AgentChat 组件测试覆盖所有 UI States 渲染分支，全部 pass
**Plans:** TBD
**UI hint:** yes

#### Phase 5: Eval 验证闸门 (Sunday-Night Gate)
**Goal:** 在真实 corpus (VueUse) 上验证 agent 答得对、证据正确、≥ 2 tool calls 命中，决定 ship 或 pivot
**Depends on:** Phase 1-4 (full stack runnable)
**Requirements:** EVAL-01, EVAL-02, EVAL-03, TEST-05
**Success Criteria** (what must be TRUE):
  1. 用户用 project-river CLI 把 `vueuse/vueuse` 仓库 ingest 进 PostgreSQL，可在 Web 端正常浏览河流图
  2. Agent 在 VueUse 上正确回答 hardest test "useStorage 主要由谁维护？最近 6 个月 owner shift？"，with ≥ 2 tool calls 且证据正确
  3. 5 个 chip questions 在 VueUse 上至少 4/5 给出正确证据
  4. Playwright E2E 验证 chip 点击 → streaming 完成 → tool-call card 可展开 → 中英切换全链路 pass
  5. Gate 结论已记录：PASS → ship v0.2.0；FAIL → 触发 Vercel AI SDK pivot plan（保留 tools + UI，仅替换 agent 引擎）
**Plans:** TBD

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pre-flight 与 Schema | 2/2 | Complete   | 2026-04-27 |
| 2. Tools 纯函数层 | 0/2 | Planning complete | — |
| 3. Agent 引擎与路由 | 0/2 | Planning complete | — |
| 4. 聊天 UI 与 i18n | 0/0 | Not started | — |
| 5. Eval 验证闸门 | 0/0 | Not started | — |

### Coverage

- v1 requirements: 23
- Mapped: 23 / 23 ✓
- Orphaned: 0

---

## Completed Milestones

- ✅ **v1.0 MVP** — 阶段 1-8（已于 2026-04-09 发布）
- ✅ **v1.1 可视化增强** — 阶段 9-10（已于 2026-04-16 发布）
- ✅ **v0.1.0 Public Release** — 2026-04-24（README Roadmap section + acknowledgements）

<details>
<summary>✅ v1.0 MVP（阶段 1-8）— 已于 2026-04-09 发布</summary>

- [x] 阶段 1-8: 基础设施、数据库、CLI 解析、API、Streamgraph 渲染、SVG 导出

</details>

<details>
<summary>✅ v1.1 可视化增强（阶段 9-10）— 已于 2026-04-16 发布</summary>

- [x] 阶段 9: Aggregated Streamgraph & Contributor Color Rework — 2026-04-15
- [x] 阶段 10: Docked Panel Layout — 2026-04-16

</details>

---

*Last updated: 2026-05-03 — Phase 3 plans created (2 plans, 2 waves). AGENT-01~04 + TEST-02/03 ready for execution.*
