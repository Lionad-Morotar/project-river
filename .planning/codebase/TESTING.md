# 测试模式

**分析日期：** 2026-04-23

## 测试框架

**运行器：**
- Vitest `^3.0.0`
- 断言库：内置（Vitest 的 `expect`，基于 chai）

**Workspace 配置：**
- `vitest.workspace.ts`：
  ```ts
  export default [
    'apps/web/vitest.config.ts',
    'packages/pipeline/vitest.config.ts',
  ]
  ```

**运行命令：**
```bash
pnpm test              # 运行全 workspace 测试（vitest run）
vitest                 # 监视模式（从 workspace 根目录或子项目）
vitest run             # 运行所有测试一次
```

## 测试文件组织

**位置模式：** 测试位于各 workspace 内的专用测试目录，或与源文件同目录：

```
apps/web/
├── test/
│   ├── setup.ts                        # 全局测试设置（h3 全局变量、dotenv）
│   ├── components/
│   │   └── ResizeHandle.spec.ts        # Vue 组件测试（@vue/test-utils 挂载）
│   ├── composables/
│   │   ├── useContributorColors.spec.ts  # 组合式函数测试（新）
│   │   ├── useContributorColors.test.ts  # 组合式函数测试（旧）
│   │   └── useStreamgraphData.test.ts    # 组合式函数测试
│   └── utils/
│       ├── d3Helpers.test.ts           # 工具函数测试
│       ├── githubUrl.spec.ts           # GitHub URL 解析测试（新）
│       ├── healthRules.spec.ts         # 健康规则评估测试（新）
│       ├── monthDetailHelpers.test.ts  # 月份详情工具测试
│       ├── svgExport.spec.ts           # SVG 导出测试（新）
│       └── svgExport.test.ts           # SVG 导出测试（旧）
├── server/api/projects/[id]/
│   ├── daily.get.test.ts               # 与处理器同目录
│   ├── daily-aggregated.get.test.ts    # 与处理器同目录（新）
│   └── monthly.get.test.ts             # 与处理器同目录
├── e2e/
│   └── docked-panel.spec.ts            # Playwright E2E 测试（新）

packages/pipeline/
├── tests/
│   ├── parser.test.ts
│   ├── cli.test.ts
│   ├── analyze.test.ts
│   ├── calcDay.test.ts
│   ├── gitignore.test.ts               # .gitignore 过滤测试（新）
│   └── sumDay.test.ts
```

**命名：**
- `{module}.test.ts` — 源文件名加 `.test` 后缀
- `{module}.spec.ts` — 同样有效，与 `.test.ts` 混用
- 当前 codebase 中 `.test.ts` 和 `.spec.ts` 并存，无严格区分规则

## 测试环境

**packages/pipeline：**
- 环境：`node`（默认）
- 配置：`packages/pipeline/vitest.config.ts`
- 解析 workspace 别名 `@project-river/db/client` 和 `@project-river/db/schema`

**apps/web：**
- 环境：`jsdom`（默认，通过 vitest.config.ts 配置）
- 自定义 `test/setup.ts` 向 `globalThis` 注入 H3 全局变量（`defineEventHandler`、`getRouterParam` 等）
- 配置：`apps/web/vitest.config.ts`
- 解析 `~/` 别名到 `app/` 目录，以及 workspace 别名
- 使用 `@vitejs/plugin-vue` 支持 Vue SFC 测试

## 测试结构

**标准模式：**
```typescript
import { describe, expect, it } from 'vitest'
import { functionUnderTest } from '../src/module'

describe('functionUnderTest', () => {
  it('以现在时描述期望行为', () => {
    const result = functionUnderTest(input)
    expect(result).toEqual(expectedValue)
  })
})
```

**代码库示例**（`packages/pipeline/tests/parser.test.ts`）：
```typescript
describe('parseLogStream', () => {
  it('basic parsing yields 2 commits with correct fields and files', async () => {
    async function* lines(): AsyncGenerator<string> {
      yield 'abc123\tAlice\talice@example.com\t2026-04-01T10:00:00Z\tfeat: add foo\tbar'
      yield '10\t2\tsrc/a.ts'
      yield ''
    }

    const commits = await collect(parseLogStream(lines()))
    expect(commits).toHaveLength(2)
    expect(commits[0].hash).toBe('abc123')
  })
})
```

**数据库集成测试模式**（`apps/web/server/api/projects/[id]/daily.get.test.ts`）：
```typescript
describe('daily endpoint', () => {
  const hasDb = !!process.env.DATABASE_URL

  beforeAll(async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL is not set, skipping DB-dependent tests')
      return
    }
    // 播种测试数据
    const [project] = await db.insert(projects).values({ name: 'daily-test', path: '/tmp/daily-test' }).returning()
    projectId = project.id
  })

  afterAll(async () => {
    if (!hasDb) return
    // 清理测试数据
    await db.delete(sum_day).where(eq(sum_day.projectId, projectId))
    await pool.end()
  })

  const testOrSkip = hasDb ? it : it.skip
  testOrSkip('returns 404 for nonexistent project', async () => {
    await expect(dailyHandler(createMockEvent({ id: '999999' }))).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

**Vitest 条件跳过模式**（`packages/pipeline/tests/gitignore.test.ts`）：
```typescript
it.skipIf(!hasDb)('returns chronological gitignore history for repo', async () => {
  const history = await getGitignoreHistory(repoPath!)
  expect(history).toHaveLength(2)
})
```

## Mock 策略

**框架：** Vitest 内置 `vi`

**模式 — `vi.doMock` + 动态导入**（`packages/pipeline/tests/cli.test.ts`）：
```typescript
const analyzeRepo = vi.fn()

vi.doMock('../src/db/analyze.ts', () => ({
  analyzeRepo,
}))

const { runAnalyze } = await import('../src/cli.ts')

describe('runAnalyze', () => {
  beforeEach(() => {
    analyzeRepo.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls analyzeRepo with defaults when only repo path is provided', async () => {
    await runAnalyze(['/path/to/repo'])
    expect(analyzeRepo).toHaveBeenCalledTimes(1)
    expect(analyzeRepo).toHaveBeenCalledWith('/path/to/repo', undefined, {
      batchSize: 2000,
      force: false,
      ignore: true,
      incremental: false,
    })
  })
})
```

**模式 — DOM Mock**（`apps/web/test/utils/svgExport.spec.ts`）：
```typescript
// @vitest-environment jsdom
import { vi } from 'vitest'

const createObjectURL = vi.fn(() => 'blob:test')
const revokeObjectURL = vi.fn()
URL.createObjectURL = createObjectURL
URL.revokeObjectURL = revokeObjectURL

const clickSpy = vi.fn()
HTMLAnchorElement.prototype.click = clickSpy
```

**应该 Mock 的内容：**
- 数据库操作（`vi.doMock` 模拟 `analyzeRepo`）
- DOM API（`URL.createObjectURL`、`HTMLAnchorElement.prototype.click`）
- 文件系统（通过临时目录而非 Mock `fs`）

**不应 Mock 的内容：**
- 真实 PostgreSQL — 集成测试在设置 `DATABASE_URL` 时使用真实数据库
- 真实 Git 仓库 — 测试通过 `mkdtempSync` + `execSync('git ...')` 创建临时 Git 仓库
- Git 操作 — 在临时目录中使用真实 `git` 命令

## 测试数据与工厂函数

**工厂函数**（`packages/pipeline/tests/calcDay.test.ts`）：
```typescript
function makeCommit(
  authorEmail: string,
  committerDate: Date,
  files: ParsedCommit['files'],
): ParsedCommit {
  return {
    hash: '0000000',
    authorName: 'Test',
    authorEmail,
    committerDate,
    message: 'test',
    files,
  }
}
```

**工厂函数**（`apps/web/test/utils/healthRules.spec.ts`）：
```typescript
function makeStats(overrides: Partial<HealthStatsInput> = {}): HealthStatsInput {
  return {
    totalCommits: 100,
    totalContributors: 5,
    topContributors: [
      { contributor: 'alice', commits: 50 },
      { contributor: 'bob', commits: 20 },
    ],
    lastDate: '2026-04-10',
    recent90DaysCommits: 40,
    prior270DaysDailyAvg: 0.5,
    avgLinesPerCommit: 200,
    recentQuarterContributors: 5,
    previousQuarterContributors: 4,
    daysSinceLastCommit: 7,
    ...overrides,
  }
}
```

**临时 Git 仓库**（`packages/pipeline/tests/analyze.test.ts`）：
```typescript
function makeTempGitRepo(dates: string[]): string {
  const tempDir = mkdtempSync(`${tmpdir()}/river-analyze-test-`)
  execSync('git init', { cwd: tempDir })
  execSync('git config user.name "Test User"', { cwd: tempDir })
  execSync('git config user.email "test@example.com"', { cwd: tempDir })
  // 通过 GIT_AUTHOR_DATE / GIT_COMMITTER_DATE 创建受控日期的提交
  return tempDir
}
```

**Mock 事件创建**（`apps/web/server/api/projects/[id]/daily.get.test.ts`）：
```typescript
function createMockEvent(params: Record<string, string>, query: Record<string, string> = {}) {
  const url = `http://localhost/api/projects/${params.id}/daily?${new URLSearchParams(query)}`
  const event = createEvent({ url })
  Object.assign(event.context, { params })
  event.node = event.node || {}
  event.node.res = event.node.res || {}
  event.node.res.setHeader = () => event.node!.res!
  return event
}
```

**异步生成器辅助函数**（`packages/pipeline/tests/parser.test.ts`）：
```typescript
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of gen) {
    results.push(item)
  }
  return results
}
```

## 测试类型

**单元测试：**
- 纯工具函数（`d3Helpers.ts`、`monthDetailHelpers.ts`、`calcDay.ts`、`healthRules.ts`、`githubUrl.ts`）
- 解析器逻辑（`parser.ts` — 异步生成器的流式解析）
- CLI 参数解析（`cli.ts` — 通过 Mock 依赖）
- 组合式函数（`useContributorColors.ts`、`useStreamgraphData.ts`）

**集成测试：**
- 数据库操作（`analyze.test.ts` — 完整管线：解析 → 写入 → 查询）
- API 端点（`daily.get.test.ts`、`daily-aggregated.get.test.ts`、`monthly.get.test.ts` — 真实 DB 查询 + H3 事件 Mock）
- 累计统计（`sumDay.test.ts` — 插入 daily_stats，验证 sum_day）
- .gitignore 过滤（`gitignore.test.ts` — 临时 Git 仓库 + 真实 git 命令）

**组件测试：**
- Vue SFC 组件挂载测试（`ResizeHandle.spec.ts` — 使用 `@vue/test-utils` 的 `mount`）
- 断言 DOM 事件发射（`pointerdown`、`pointermove`、`pointerup`、`keydown`）
- 断言 CSS 类应用

**E2E 测试：**
- 框架：Playwright `^1.59.1`
- 配置：`apps/web/playwright.config.ts`
- 测试目录：`apps/web/e2e/`
- 测试文件：`docked-panel.spec.ts`
- 测试场景：拖拽面板到不同边缘、resize、刷新后状态恢复
- 基础 URL：`http://localhost:10400`
- 仅 Chromium 浏览器

## 覆盖率

**要求：** 未强制执行。未在 Vitest 配置中找到覆盖率阈值配置。

**查看覆盖率：** 未配置。安装覆盖率插件后可添加 `--coverage` 标志。

## 按测试类型分类的关键模式

### 单元测试（纯逻辑）
- 直接导入，无需 Mock
- 输入 → 输出断言
- 显式测试边界情况（空数组、边界条件、时区处理）
- 示例：`packages/pipeline/tests/calcDay.test.ts` — 时区边界检测
- 示例：`apps/web/test/utils/healthRules.spec.ts` — 多规则组合测试

### 集成测试（数据库）
- `beforeAll` / `afterAll` 用于设置/清理
- 通过 `process.env.DATABASE_URL` 检查条件性跳过
- 在 `beforeAll` 中播种数据，在 `afterAll` 中删除
- 需要时在 `afterEach` 进行逐测试清理
- 示例：`packages/pipeline/tests/analyze.test.ts` — 完整 git 到数据库管线
- 示例：`packages/pipeline/tests/sumDay.test.ts` — 逐测试清理模式

### 集成测试（API 端点）
- 使用 `createEvent({ url })` 创建 Mock H3 事件
- 通过 `event.context.params` 注入路由参数
- 通过 `event.node.res.setHeader` 模拟响应头设置
- 验证 Zod Schema 拒绝非法参数（400 错误）
- 示例：`apps/web/server/api/projects/[id]/daily.get.test.ts`

### 组件测试（Vue SFC）
- 使用 `@vue/test-utils` 的 `mount` 挂载组件
- 通过 `wrapper.emitted()` 断言事件发射
- 通过 `wrapper.classes()` 断言 CSS 类
- 通过 `wrapper.trigger()` 模拟键盘事件
- 示例：`apps/web/test/components/ResizeHandle.spec.ts`

### 组合式函数测试
- 不使用 `@vue/test-utils` 挂载 — 组合式函数直接作为函数测试
- 调用组合式函数并断言返回值
- 示例：`apps/web/test/composables/useContributorColors.spec.ts`
- 示例：`apps/web/test/composables/useStreamgraphData.test.ts`

### 依赖 DOM 的测试
- 使用 `// @vitest-environment jsdom` 文件级指令
- 直接在全局对象上 Mock 浏览器 API
- 示例：`apps/web/test/utils/svgExport.spec.ts`

## 测试生命周期

**设置：**
- `apps/web/test/setup.ts` — 加载 `.env` 获取 `DATABASE_URL`，注入 H3 全局变量

**清理：**
- `afterAll` 调用 `pool.end()` 关闭数据库连接
- `afterEach` 清理每个测试的播种数据
- 临时 Git 仓库由 OS 自动清理

## 超时配置

- 数据库密集型测试使用显式超时：`{ timeout: 30000 }`
- 单元测试使用 Vitest 默认超时（5 秒）

## E2E 测试详情

**Playwright 配置**（`apps/web/playwright.config.ts`）：
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:10400',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

**E2E 辅助函数**（`apps/web/e2e/docked-panel.spec.ts`）：
```typescript
async function dragToEdge(page: any, handleLocator: any, targetX: number, targetY: number) {
  const box = await handleLocator.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
```

---

*测试分析：2026-04-23*
