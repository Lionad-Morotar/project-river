---
phase: 01-pre-flight-schema-foundation
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/db/src/schema/core.ts
  - packages/db/drizzle/0006_*.sql
  - apps/web/docs/agent-schema-verified.md
autonomous: true
requirements:
  - INFRA-03
user_setup:
  - service: postgresql
    why: "EXPLAIN ANALYZE 需要真实数据量来验证索引效果"
    notes: "使用 docker-compose.yml 启动的本地 PostgreSQL；需要至少一个已 ingest 的项目（建议用 project-river 自身或 VueUse）"

must_haves:
  truths:
    - "commit_files 表 schema 已确认，\d 输出与 core.ts 定义一致"
    - "EXPLAIN ANALYZE 三组查询（4a/4b/4c）已执行，输出已记录"
    - "如果选方案 A：(project_id, path) btree index 已生成 migration 并已 apply 到 dev db"
    - "如果选方案 C：不加 index 的决策有 EXPLAIN 数据支撑"
    - "verification 文档已写入，Phase 2 实现 queryCommitsByPath 时可引用"
  artifacts:
    - path: "packages/db/src/schema/core.ts"
      provides: "Drizzle schema 定义（如果选 A 则加新 index）"
      contains: "commit_files_project_path_idx"
      condition: "仅当方案 A 被选中时修改"
    - path: "packages/db/drizzle/0006_*.sql"
      provides: "Drizzle Kit 生成的 migration SQL"
      contains: "CREATE INDEX.*commit_files_project_path_idx"
      condition: "仅当方案 A 被选中时生成"
    - path: "apps/web/docs/agent-schema-verified.md"
      provides: "Schema 验证报告 + EXPLAIN 输出 + 决策记录"
      contains: "EXPLAIN ANALYZE"
      min_lines: 50
  key_links:
    - from: "packages/db/src/schema/core.ts"
      to: "packages/db/drizzle/0006_*.sql"
      via: "pnpm db:generate"
      pattern: "drizzle-kit generate"
    - from: "packages/db/drizzle/0006_*.sql"
      to: "PostgreSQL dev db"
      via: "pnpm db:migrate"
      pattern: "drizzle-kit migrate"
---

<objective>
验证 commit_files JOIN 表 schema 现状，通过 EXPLAIN ANALYZE 实测决定是否需要新增 `(project_id, path)` btree index，如果需要则生成 Drizzle migration 并 apply。

Purpose: Phase 2 的 `queryCommitsByPath` tool 将发起 `WHERE project_id = ? AND path LIKE 'prefix%'` 查询。本计划确认该查询能高效执行（走 index），否则后续 agent 在大型项目（如 VueUse）上会慢到不可用。
Output: Schema 验证文档（含 EXPLAIN 输出）+ 可选的 migration 文件 + 已 apply 的 index。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md
@.planning/phases/01-pre-flight-schema-foundation/01-PATTERNS.md

## 关键 schema 真相（从代码库提取）

### packages/db/src/schema/core.ts（commit_files 表）
```typescript
export const commit_files = pgTable('commit_files', {
  id: serial('id').primaryKey(),
  commitId: integer('commit_id').notNull().references(() => commits.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  insertions: integer('insertions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
}, table => [
  index('commit_files_commit_idx').on(table.commitId),
  index('commit_files_project_idx').on(table.projectId),
  uniqueIndex('commit_files_commit_path_idx').on(table.commitId, table.path),
])
```

### 现有索引（3 个）
- `commit_files_commit_idx` btree on `(commit_id)`
- `commit_files_project_idx` btree on `(project_id)`
- `commit_files_commit_path_idx` btree UNIQUE on `(commit_id, path)`

### 关键缺失
**`path` 列没有独立 btree index**。`commit_files_commit_path_idx` 的第一 key 是 `commit_id`，不能服务 `path LIKE 'prefix%'` 查询。

### Drizzle 工作流
1. 编辑 `packages/db/src/schema/core.ts` — 在 `table => [...]` 数组中加新 `index()`
2. 运行 `pnpm --filter @project-river/db db:generate`（即 `drizzle-kit generate`）
3. 自动生成 `packages/db/drizzle/0006_xxx.sql`
4. 运行 `pnpm --filter @project-river/db db:migrate` 应用到数据库
5. 提交 migration 文件到 git

### 现有 migration 风格参考（0002_fat_komodo.sql）
```sql
CREATE INDEX "commit_files_project_idx" ON "commit_files" USING btree ("project_id");
```

### 现有 migration 风格参考（0003_add_unique_constraints.sql）
```sql
CREATE UNIQUE INDEX "commit_files_commit_path_idx" ON "commit_files" USING btree ("commit_id","path");--> statement-breakpoint
```
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema smoke test + psql 进入验证</name>
  <files>apps/web/docs/agent-schema-verified.md（创建）</files>
  <read_first>
    - packages/db/src/schema/core.ts（确认 commit_files 表定义）
    - packages/db/drizzle/0002_fat_komodo.sql（migration 风格参考）
    - packages/db/drizzle/0003_add_unique_constraints.sql（复合索引风格参考）
    - .planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md（INFRA-03 验证步骤）
  </read_first>
  <action>
    1. 确认 PostgreSQL 正在运行：`docker ps | grep postgres` 或根据项目 docker-compose.yml 启动。
    2. 运行 schema migration smoke test：
       ```bash
       pnpm --filter @project-river/db db:migrate
       ```
       预期：idempotent，无 pending migration warning，正常退出（exit code 0）。
    3. 用 psql 进入数据库：
       ```bash
       # 从 .env 或 docker-compose.yml 获取连接信息
       # 典型命令：
       psql $DATABASE_URL
       # 或：
       psql -h localhost -U postgres -d project_river
       ```
    4. 在 psql 中执行：
       ```sql
       \d commit_files
       ```
       记录输出（列名、类型、现有索引列表）。
    5. 确认现有 3 个索引与 core.ts 定义一致：
       - `commit_files_commit_idx`
       - `commit_files_project_idx`
       - `commit_files_commit_path_idx`
    6. 获取测试 corpus 信息：
       ```sql
       SELECT COUNT(*) FROM commit_files;
       SELECT COUNT(DISTINCT project_id) FROM commit_files;
       ```
    7. 创建 apps/web/docs/agent-schema-verified.md 的头部：
       ```markdown
       # commit_files Schema Verification

       **Date:** 2026-04-27
       **Phase:** 01-pre-flight-schema-foundation
       **Requirement:** INFRA-03

       ## Environment

       - PostgreSQL Version: (从 \d output 或 SELECT version() 获取)
       - Test Corpus: (项目名称)
       - commit_files 总行数: (从 COUNT(*))
       - 项目数: (从 COUNT(DISTINCT project_id))

       ## Schema Check

       ### \d commit_files 输出

       ```
       (粘贴 \d commit_files 完整输出)
       ```

       ### 索引清单验证

       | 索引名 | 类型 | 列 | 与 core.ts 一致 |
       |---|---|---|---|
       | commit_files_commit_idx | btree | commit_id | ✅ |
       | commit_files_project_idx | btree | project_id | ✅ |
       | commit_files_commit_path_idx | btree unique | commit_id, path | ✅ |
       ```
  </action>
  <verify>
    <automated>test -f apps/web/docs/agent-schema-verified.md && grep -q "commit_files Schema Verification" apps/web/docs/agent-schema-verified.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - `pnpm db:migrate` 成功，无 warning
    - psql 能连接，\d commit_files 输出已记录
    - 现有 3 个索引与 core.ts 一致
    - agent-schema-verified.md 已创建，头部信息已填充
  </done>
  <acceptance_criteria>
    - `pnpm --filter @project-river/db db:migrate` 退出码为 0
    - `apps/web/docs/agent-schema-verified.md` 存在
    - `grep -q "Schema Check" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "commit_files_commit_idx" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "commit_files_project_idx" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "commit_files_commit_path_idx" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "PostgreSQL Version" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "commit_files 总行数" apps/web/docs/agent-schema-verified.md` 为真
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: EXPLAIN ANALYZE 实测三组查询</name>
  <files>apps/web/docs/agent-schema-verified.md（追加内容）</files>
  <read_first>
    - apps/web/docs/agent-schema-verified.md（已创建的头部）
    - .planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md（4a/4b/4c 查询定义）
    - packages/db/src/schema/core.ts（确认列名：projectId → project_id, path → path）
  </read_first>
  <action>
    在 psql 中执行以下三组 EXPLAIN ANALYZE，将完整输出追加到 agent-schema-verified.md。

    **前置步骤**：找一个有 commit_files 数据的项目 ID：
    ```sql
    SELECT project_id, COUNT(*) as cnt FROM commit_files GROUP BY project_id ORDER BY cnt DESC LIMIT 5;
    ```
    记录一个 project_id（记为 `<PROJECT_ID>`），用于后续查询。

    **4a — Prefix LIKE with project filter（核心查询模式）**：
    ```sql
    EXPLAIN ANALYZE
    SELECT path FROM commit_files
    WHERE project_id = <PROJECT_ID> AND path LIKE 'packages/%'
    LIMIT 100;
    ```
    记录：
    - 是否使用 Index Scan / Bitmap Index Scan / Seq Scan
    - Execution Time（毫秒）
    - Cost

    **4b — Leading wildcard（反例，验证 prefix-only 决策）**：
    ```sql
    EXPLAIN ANALYZE
    SELECT path FROM commit_files
    WHERE path LIKE '%/util/%'
    LIMIT 100;
    ```
    预期：Seq Scan（leading `%` 无法走 btree）。记录实际 plan。

    **4c — 临时测试 (project_id, path) index 效果**：
    ```sql
    -- 在事务内测试，测完回滚
    BEGIN;
    CREATE INDEX "__test_commit_files_project_path_idx" ON "commit_files" USING btree ("project_id", "path");
    EXPLAIN ANALYZE
    SELECT path FROM commit_files
    WHERE project_id = <PROJECT_ID> AND path LIKE 'packages/%'
    LIMIT 100;
    ROLLBACK;
    ```
    记录：
    - 创建临时索引后 4a 查询的 plan 变化
    - Execution Time 对比
    - 是否切换为 Index Scan

    将以上输出按以下格式追加到 agent-schema-verified.md：
    ```markdown
    ## EXPLAIN ANALYZE 4a — Prefix LIKE with project filter

    ```sql
    EXPLAIN ANALYZE SELECT path FROM commit_files WHERE project_id = <PROJECT_ID> AND path LIKE 'packages/%' LIMIT 100;
    ```

    输出：
    ```
    (粘贴完整 EXPLAIN ANALYZE 输出)
    ```

    关键指标：
    - Scan type: (Index Scan / Bitmap Index Scan / Seq Scan)
    - Execution Time: (ms)

    ## EXPLAIN ANALYZE 4b — Leading wildcard (anti-pattern)

    ...（同上格式）

    ## EXPLAIN ANALYZE 4c — With (project_id, path) index (rolled back)

    ...（同上格式）
    ```
  </action>
  <verify>
    <automated>grep -c "EXPLAIN ANALYZE" apps/web/docs/agent-schema-verified.md | grep -q "3\|4\|5" && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - 三组 EXPLAIN ANALYZE 已执行
    - 完整输出已粘贴到 agent-schema-verified.md
    - 4c 使用 BEGIN/ROLLBACK，无残留临时索引
  </done>
  <acceptance_criteria>
    - `grep -q "EXPLAIN ANALYZE 4a" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "EXPLAIN ANALYZE 4b" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "EXPLAIN ANALYZE 4c" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "Scan type:" apps/web/docs/agent-schema-verified.md` 为真（至少 3 处）
    - `grep -q "Execution Time:" apps/web/docs/agent-schema-verified.md` 为真（至少 3 处）
    - 4c 使用 `BEGIN; ... ROLLBACK;` 模式，确认无残留：`psql -c "\di *__test_*"` 或等效命令返回 0 行（或 test 索引不存在）
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: 决策并执行索引 migration（方案 A 或 C）</name>
  <files>packages/db/src/schema/core.ts, packages/db/drizzle/0006_*.sql</files>
  <read_first>
    - apps/web/docs/agent-schema-verified.md（4a/4b/4c 结果）
    - packages/db/src/schema/core.ts（确认索引定义位置）
    - packages/db/drizzle/0002_fat_komodo.sql（CREATE INDEX 语法参考）
    - .planning/phases/01-pre-flight-schema-foundation/01-CONTEXT.md（A/B/C 决策矩阵）
  </read_first>
  <action>
    **决策逻辑**（根据 EXPLAIN 结果）：

    1. 如果 4a 结果是 **Seq Scan** 或 Execution Time > 100ms（在已有数据量下）：
       → **选方案 A**：新增 `(project_id, path)` 复合 btree index。

    2. 如果 4a 结果是 **Bitmap Index Scan** 或 **Index Scan**（使用现有索引），且 Execution Time < 50ms：
       → **选方案 C**：不加 index，接受现状。

    3. 如果 4c 显示创建 `(project_id, path)` index 后 Execution Time 显著降低（比如从 200ms 降到 5ms）：
       → **选方案 A**。

    4. **不写方案 B**（path 单列 index）—— query pattern 永远带 project_id，单列 index 不贴查询模式。

    ---

    **如果选方案 A（新增 index）**：

    a. 修改 `packages/db/src/schema/core.ts`，在 `commit_files` 表的 `table => [...]` 数组中添加：
       ```typescript
       index('commit_files_project_path_idx').on(table.projectId, table.path),
       ```
       插入位置：在 `index('commit_files_project_idx').on(table.projectId),` 之后（按逻辑分组）。

    b. 确认 git working tree 干净（`git status` 无未提交修改），然后运行：
       ```bash
       pnpm --filter @project-river/db db:generate
       ```
       预期：生成 `packages/db/drizzle/0006_xxx.sql`（xxx 由 Drizzle 自动命名）。

    c. 审查生成的 SQL 文件：
       ```bash
       cat packages/db/drizzle/0006_*.sql
       ```
       预期内容：
       ```sql
       CREATE INDEX "commit_files_project_path_idx" ON "commit_files" USING btree ("project_id","path");--> statement-breakpoint
       ```
       或类似（Drizzle 可能加上 `IF NOT EXISTS`）。

    d. 应用 migration：
       ```bash
       pnpm --filter @project-river/db db:migrate
       ```

    e. 验证 index 已创建：
       ```sql
       \d commit_files
       ```
       应看到 `commit_files_project_path_idx` 出现在索引列表中。

    f. 重跑 4a 查询验证：
       ```sql
       EXPLAIN ANALYZE
       SELECT path FROM commit_files
       WHERE project_id = <PROJECT_ID> AND path LIKE 'packages/%'
       LIMIT 100;
       ```
       记录新 plan（应切换为 Index Scan）。

    ---

    **如果选方案 C（不加 index）**：

    a. 不修改 core.ts，不生成 migration。
    b. 在 agent-schema-verified.md 中记录决策理由：
       ```markdown
       ## Decision: 方案 C（不加索引）

       - 4a 查询已使用 Bitmap Index Scan（commit_files_project_idx）+ filter
       - Execution Time: <X>ms（在可接受范围）
       - 4c 临时索引测试显示提升有限（<Y>ms → <Z>ms）
       - 结论：现有索引组合已足够，新增 (project_id, path) 索引的收益不足以抵消维护成本
       ```

    ---

    **无论 A 或 C**，在 agent-schema-verified.md 末尾添加决策章节：
    ```markdown
    ## Decision

    - **选中方案**: (A / C)
    - **理由**: (基于 EXPLAIN 数据的 2-3 句话)
    - **影响**: Phase 2 `queryCommitsByPath` 将使用 (新索引 / 现有索引组合)
    - **生产环境注意**: 如果未来选 A 且在生产环境执行，大表加索引可能锁表；应使用 `CREATE INDEX CONCURRENTLY`（Drizzle Kit 目前不直接支持，需手动 SQL）
    ```
  </action>
  <verify>
    <automated>
      # 检查文档中是否有决策记录
      grep -q "Decision" apps/web/docs/agent-schema-verified.md && \
      grep -q "选中方案" apps/web/docs/agent-schema-verified.md && \
      echo "PASS" || echo "FAIL"
    </automated>
  </verify>
  <done>
    - 方案 A：core.ts 已修改、migration 已生成、已 apply、index 已验证存在
    - 方案 C：文档中已记录不加 index 的决策和数据支撑
    - agent-schema-verified.md 包含完整决策章节
  </done>
  <acceptance_criteria>
    - `grep -q "Decision" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "选中方案" apps/web/docs/agent-schema-verified.md` 为真
    - `grep -q "理由" apps/web/docs/agent-schema-verified.md` 为真
    - **如果选方案 A**：
      - `grep -q "commit_files_project_path_idx" packages/db/src/schema/core.ts` 为真
      - `ls packages/db/drizzle/0006_*.sql 2>/dev/null | wc -l` 返回 1（有且仅有一个 0006 migration）
      - `grep -q "commit_files_project_path_idx" packages/db/drizzle/0006_*.sql` 为真
      - `grep -q "CREATE INDEX" packages/db/drizzle/0006_*.sql` 为真
      - psql 中 `\d commit_files` 输出包含 `commit_files_project_path_idx`
    - **如果选方案 C**：
      - `packages/db/src/schema/core.ts` 未被修改（与 git HEAD 一致：`git diff packages/db/src/schema/core.ts` 为空）
      - `ls packages/db/drizzle/0006_*.sql 2>/dev/null | wc -l` 返回 0（无 0006 migration）
      - agent-schema-verified.md 中包含 "不加索引" 或 "方案 C" 字样
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dev db → migration SQL | Drizzle Kit 从 schema 生成 SQL，人工审查后执行 |
| migration SQL → PostgreSQL | `db:migrate` 应用 SQL 到 dev 数据库 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Denial of Service | 大表加索引锁表 | accept (dev) / note (prod) | Phase 1 仅在 dev 环境执行；migration 文档中注明生产环境应使用 `CREATE INDEX CONCURRENTLY` |
| T-02-02 | Repudiation | EXPLAIN 数据丢失或不可追溯 | mitigate | 完整输出归档到 agent-schema-verified.md，包含 PostgreSQL 版本、测试 corpus、时间戳 |
| T-02-03 | Information Disclosure | migration SQL 泄露 schema 结构 | accept | migration 文件已纳入 git，schema 结构对开源项目公开 |
</threat_model>

<verification>
## 整体验证

1. **Schema 确认**：`pnpm db:migrate` 成功，psql `\d commit_files` 输出与 core.ts 一致
2. **EXPLAIN 归档**：agent-schema-verified.md 包含 4a/4b/4c 三组完整输出
3. **决策记录**：agent-schema-verified.md 包含 "Decision" 章节，说明选 A 或 C 及理由
4. **如果选 A**：
   - `grep -q "commit_files_project_path_idx" packages/db/src/schema/core.ts`
   - `test -f packages/db/drizzle/0006_*.sql`
   - psql `\d commit_files` 显示新索引
5. **如果选 C**：
   - `git diff packages/db/src/schema/core.ts` 为空
   - 无 0006 migration 文件
</verification>

<success_criteria>
- [ ] `pnpm db:migrate` 在干净 db 上能跑通，无 warning
- [ ] psql `\d commit_files` 输出已记录，现有 3 个索引与 core.ts 一致
- [ ] EXPLAIN ANALYZE 4a（prefix LIKE + project filter）已执行并记录
- [ ] EXPLAIN ANALYZE 4b（leading wildcard）已执行并记录
- [ ] EXPLAIN ANALYZE 4c（临时 index 测试）已执行并记录，ROLLBACK 无残留
- [ ] 决策（A 或 C）已记录，有数据支撑
- [ ] 如果选 A：新 migration 已生成 + 已 apply，schema/core.ts 已更新，psql 确认 index 存在
- [ ] 如果选 C：文档中记录不加 index 的理由
- [ ] agent-schema-verified.md 已写入 apps/web/docs/
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-flight-schema-foundation/01-002-schema-index-SUMMARY.md`
</output>
