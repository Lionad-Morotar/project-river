# Requirements: project-river — Milestone v0.2.0 Agentic QA

**Defined:** 2026-04-27
**Core Value:** Make Git repository evolution visceral and explorable through an interactive Streamgraph visualization.
**Milestone Goal:** 在河流图 + 确定性事件之上加一层 ReAct agent，用户用自然语言提问，agent multi-step tool calling 给出**带证据**的答案。
**Source design:** [`docs/design/agent.md`](../docs/design/agent.md) — APPROVED 2026-04-27 (9/10 review)

## v1 Requirements

本 milestone 范围内的需求，每条映射到 ROADMAP 的一个 phase。

### Pre-flight (P0 Gate)

- [ ] **PRE-01**: pi-mono + Nuxt 4 SSE hello-world spike 在 ≤ 1h 内 token 流式到达 client，无 buffering，无 boundary error。Fail → Vercel AI SDK pivot。

### Schema & Pure Library Foundation

- [ ] **INFRA-03**: 验证 / 准备 PostgreSQL `commit_files` JOIN 表 schema；ingest 流程能产生 `commit_files` 记录。
- [x] **INFRA-04**: 从 `apps/web/composables/useProjectEvents` worker 中抽出 `detectProjectEvents()` pure-lib，server 可直接 import（不依赖 Web Worker context）。

### Agent Engine

- [ ] **AGENT-01**: pi-mono ReAct loop 在 server-side 跑通，调用 Claude Sonnet via `@mariozechner/pi-ai`（locked 0.70.2 exact）。
- [ ] **AGENT-02**: Server route `apps/web/server/api/projects/[id]/agent.post.ts` 暴露 SSE streaming 接口，event types 至少含 `text`/`tool-call`/`tool-result`/`done`。
- [ ] **AGENT-03**: Tool error 不抛到 client，反馈给 LLM 让其 graceful degrade（system prompt 已说明）。
- [ ] **AGENT-04**: System prompt 中英双语 + path-based 问题强制 ≥ 2 步 tool calling 约束 + "result too large" 截断约束（GAP from Engineering Review）。

### Tools (Pure Functions, Framework-Decoupled)

- [x] **TOOL-01**: `queryContributors({ filter, sortBy, limit })` — Drizzle ORM 查 contributors + commit 聚合 + active 窗口；zod schema；纯函数；复用 `projectStats.ts` 的 `assertProjectExists` / 日期边界 / 分页 helpers。
- [x] **TOOL-02**: `queryProjectEvents({ typeFilter, dateRange })` — 包装 `detectProjectEvents()` pure-lib（INFRA-04），返回 Apr 21 design 的 `ProjectEvent` 接口。
- [x] **TOOL-03**: `queryCommitsByPath({ pathGlob, dateRange, limit })` — JOIN `commit_files` 表（NOT `commits.files` 数组），prefix-only LIKE（`prefix%`）走 btree index；message 截断 200 字符。

### UI Surface

- [ ] **UI-05**: `apps/web/app/components/AgentChat.vue` 用 Nuxt UI v4 `<USlideover>` 包装；slide-in 40% 视口宽，mobile 全屏 fallback。
- [ ] **UI-06**: 5 个 chip questions（中英 i18n）+ 常驻右下 FAB 悬浮按钮触发 drawer（可缩小回 FAB，不卸载子树）。
- [ ] **UI-07**: SSE streaming token 实时渲染 + collapsible tool-call cards（默认折叠，展开看 input/output JSON）+ step progress 指示（6-9s 延迟可见性）。
- [ ] **UI-08**: 完整 UI States — idle / streaming / tool-calling / stream-mid-error / abort / rate-limit (429 + retry-after) / cost-cap (50K session token soft 上限) / input-too-long (>500 字符) / api-key-missing / empty-result。

### i18n

- [ ] **I18N-01**: 新增 12 个 i18n 键值（中英双语）— `agent.drawer.title` / `agent.drawer.placeholder` / `agent.askButton` / `agent.drawer.minimize` / 5 个 chip / `agent.error.no_data` / `agent.error.api_key_missing` / `agent.toolcard.input` / `agent.toolcard.output`。

### Eval & Validation Gate

- [ ] **EVAL-01**: 用 project-river CLI 把 `vueuse/vueuse` ingest 进 PostgreSQL 作为 eval corpus。
- [ ] **EVAL-02**: Hardest test pass — agent 在 VueUse 上正确回答 "useStorage 主要由谁维护? 最近 6 个月有没有 owner shift?" with ≥ 2 tool calls 且证据正确。
- [ ] **EVAL-03**: 5 个 chip questions（在 VueUse 上）至少 4/5 给出正确证据。

### Tests

- [x] **TEST-01**: 3 个 tool unit tests（`queryContributors` / `queryProjectEvents` / `queryCommitsByPath`），每个覆盖 happy path + 边界（空结果 / large result truncation / 日期范围越界）。
- [x] **TEST-02**: Agent integration test（mock LLM）— 验证 ReAct loop 触发 tool call、聚合结果、tool error 反馈给 LLM 流程。
- [x] **TEST-03**: Route test (`agent.post.ts`) — SSE event sequence 正确性。
- [ ] **TEST-04**: Component test (`AgentChat.vue`) — UI States 渲染正确性（Vue Test Utils）。
- [ ] **TEST-05**: Playwright E2E — chip 点击 → streaming 完成 → tool-call card 可展开 → 中英问题切换。

## v2 Requirements

已识别但 defer 到后续 milestone，不在本 milestone 路线图内。

### Storyteller (Week 2)

- **AGENT-V2-01**: Storyteller preset — 同一 ReAct 引擎 + 固定群像故事 system prompt + Generate 按钮。
- **TOOL-V2-01**: `queryContributorTimeline(name)` — 单贡献者时间线，Storyteller 群像编排所需。

### 模型与配置

- **AGENT-V2-02**: 多模型 switcher（OpenAI / Anthropic / 其他）。
- **AGENT-V2-03**: API Key UI 表单（取代 `.env` 配置）。

### 高级 Agent 能力

- **AGENT-V2-04**: 对话历史持久化（PostgreSQL chat session 表）。
- **AGENT-V2-05**: 多轮 memory（跨 session）。
- **AGENT-V2-06**: 项目层 web search tool（GitHub Discussions / HN / Reddit / 中文社区 / release notes / 行业文章）。

### Demo Distribution

- **DEMO-V2-01**: gh-pages 静态 demo 上预生成 5 chip 问题的固定答案，bake 进 .bin（注：与 ReAct 哲学冲突，需重新设计）。

## Out of Scope

显式排除。文档化以防 scope creep。

| Feature | Reason |
|---------|--------|
| 个人贡献者反向查询（LinkedIn / Twitter / 个人新闻 / 近期状况） | 隐私 / 准确 / 法律 / 品牌四层都过不了；P3 永久 ban |
| Auth / Rate limit / Multi-tenant | 单用户自部署场景，第一周 ≤ 10 触达，不需要 |
| Prompt customization UI | system prompt 写死可控；用户自改 prompt 等于绕过 P2 修订标准 |
| 对话历史持久化（v0.2.0 内） | session in-memory only 已足够验证 ReAct 价值；v2 再做 |
| 模型 switcher（v0.2.0 内） | 只跑 Sonnet via pi-ai，省 UI 复杂度；切换通过 .env 改 |
| Web search（v0.2.0 内） | 边界设计还没做完（Phase 3 议题）；先把 Q&A 引擎做对 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRE-01 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 2 | Complete |
| TOOL-01 | Phase 2 | Complete |
| TOOL-02 | Phase 2 | Complete |
| TOOL-03 | Phase 2 | Complete |
| TEST-01 | Phase 2 | Complete |
| AGENT-01 | Phase 3 | Pending |
| AGENT-02 | Phase 3 | Pending |
| AGENT-03 | Phase 3 | Pending |
| AGENT-04 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Complete |
| TEST-03 | Phase 3 | Complete |
| UI-05 | Phase 4 | Pending |
| UI-06 | Phase 4 | Pending |
| UI-07 | Phase 4 | Pending |
| UI-08 | Phase 4 | Pending |
| I18N-01 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| EVAL-01 | Phase 5 | Pending |
| EVAL-02 | Phase 5 | Pending |
| EVAL-03 | Phase 5 | Pending |
| TEST-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23 ✓
- Unmapped: 0

---
*Requirements defined: 2026-04-27 — sourced from approved design doc `docs/design/agent.md` (APPROVED 9/10 + 16-issue engineering review resolved)*
*Last updated: 2026-04-27 — Phase 1 narrowed to spike + schema; INFRA-04 (detectProjectEvents pure-lib refactor) moved into Phase 2 as Lane C prerequisite to Lane A tools.*
