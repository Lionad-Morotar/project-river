# 编码规范

**分析日期：** 2026-04-23

## 项目结构

由 **pnpm workspaces** 管理的 Monorepo，两个 workspace：
- `apps/*` — 前端（Nuxt v4 Web 应用）
- `packages/*` — 共享库（db、pipeline）

## 命名约定

**文件：**
- `camelCase.ts` — 源文件（如 `d3Helpers.ts`、`useContributorColors.ts`、`healthRules.ts`）
- `camelCase.test.ts` / `camelCase.spec.ts` — 测试文件，位于 `tests/`、`test/` 目录或与源文件同目录
- `camelCase.get.ts` — Nuxt API 路由文件（后缀表示 HTTP 动词，如 `daily.get.ts`、`import.post.ts`）
- `PascalCase.vue` — Vue SFC 组件（如 `Streamgraph.vue`、`MonthSelector.vue`、`ResizeHandle.vue`）
- `camelCase.ts` — 以 `use` 为前缀的组合式函数（如 `useContributorColors.ts`、`useStreamgraphData.ts`）

**函数：**
- `camelCase` — 标准函数（如 `parseLogStream`、`getContributorColor`、`buildStack`、`evaluateHealthRules`）
- `useXxx` — Vue 组合式函数（如 `useContributorColors`、`useProjectData`、`useStaticData`）
- 异步生成器使用 `async function*`（如 `parseRepo`、`parseLogStream`）

**变量：**
- `camelCase` — 标准变量（如 `pivotMap`、`colorMap`、`selectedMonth`）
- 优先使用 `const` 而非 `let`；未观察到 `var`
- 接口/类型使用 `PascalCase`（如 `ParsedCommit`、`DailyRow`、`FileChange`、`HealthSignal`、`HealthStatsInput`）

**数据库列：**
- Schema 定义中使用 `snake_case`（如 `author_name`、`committer_date`、`project_id`）
- TypeScript 接口属性使用 `camelCase`（如 `authorName`、`committerDate`）
- Drizzle ORM 自动处理映射

## 代码风格

**Lint 工具：**
- 工具：ESLint v9 + `@antfu/eslint-config`（`^4.0.0`）
- 根配置位于 `/eslint.config.mjs`：
  ```js
  import antfu from '@antfu/eslint-config'
  export default antfu({
    vue: true,
    typescript: true,
    formatters: true,
    unocss: false,
    test: true,
  })
  ```
- `apps/web` 通过 `import config from '../../eslint.config.mjs'` 继承根配置
- 规则集包含：Vue 支持、TypeScript 规则、格式化集成、测试文件规则

**格式化：**
- 由 `@antfu/eslint-config` 的格式化器处理（未检测到独立的 Prettier 配置）
- `packages/db` 中的 import/export 语句一致使用分号
- `apps/web` 和 `packages/pipeline` 中省略分号 — antfu 风格

## TypeScript

**版本：** `5.8.3`

**tsconfig — `packages/pipeline`：**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "rootDir": ".",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "paths": {
      "@project-river/db/client": ["../db/src/client.ts"],
      "@project-river/db/schema": ["../db/src/schema/index.ts"]
    },
    "strict": true,
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

**tsconfig — `apps/web`：**
- 由 Nuxt 管理，引用 `.nuxt/tsconfig.*.json` 生成的文件
- 路径别名 `~/` 映射到 `./app`（应用根目录）

**严格模式：** 所有包均启用。

## Import 组织

**顺序（观察到的模式）：**
1. Node.js 内置模块：`import process from 'node:process'`、`import path from 'node:path'`
2. 外部包：`import { defineConfig } from 'vitest/config'`、`import { z } from 'zod'`
3. 内部包（workspace 别名）：`import { db } from '@project-river/db/client'`
4. 相对路径或 `~/` 别名的本地导入：`import { buildStack } from '~/utils/d3Helpers'`

**路径别名：**
- `~/` — 映射到 Nuxt 应用中的 `app/` 目录（`apps/web/app/`）
- `~/components`、`~/composables`、`~/utils` — Vitest 中显式解析的别名
- `@project-river/db/client` — workspace 别名，解析到 `packages/db/src/client.ts`
- `@project-river/db/schema` — workspace 别名，解析到 `packages/db/src/schema/index.ts`

**模块导出：**
- 桶文件使用 `export * from './module'` 模式（如 `packages/db/src/schema/index.ts`、`packages/pipeline/src/index.ts`）
- API 处理器和 Nuxt 页面使用默认导出
- 工具函数、类型和组合式函数使用具名导出
- TypeScript 导入路径使用 `.ts` 后缀：`import { parseRepo } from '../src/parser.ts'`

## 错误处理

**观察到的模式：**
- 致命情况抛出带描述性消息的 `Error`：`throw new Error('git log exited with code ${exitCode}')`
- Nuxt API 处理器使用 h3 的 `createError({ statusCode, statusMessage })` 处理 HTTP 错误（400、404）
- 查询校验使用 Zod Schema，通过 `getValidatedQuery(event, querySchema.parse)` 验证
- 依赖数据库的测试在 `DATABASE_URL` 未设置时优雅跳过：
  ```ts
  const hasDb = !!process.env.DATABASE_URL
  const testOrSkip = hasDb ? it : it.skip
  ```

## 日志

**框架：** 仅 `console`（未检测到结构化日志库）

**模式：**
- `console.error(err.message)` 用于 CLI 错误输出（`packages/pipeline/src/cli.ts`）
- `console.warn(...)` 用于条件性测试跳过提示
- `console.warn('[svgExport] No SVG node available')` 用于运行时警告
- 尚未配置生产级日志框架

## Git 钩子

**提交前钩子：**
- 位置：`.husky/pre-commit`
- 内容：`npx lint-staged`
- 通过根 `package.json` 的 `prepare` 脚本由 husky v9 安装

**lint-staged 配置**（根 `package.json`）：
```json
{
  "lint-staged": {
    "*.{js,ts,mjs,cjs,vue,json,md}": "eslint --fix"
  }
}
```

## 提交信息

**风格：** Conventional Commits（从 git log 中观察到）
- 格式：`type(scope): description`
- 观察到的类型：`chore`、`docs`、`fix`
- 观察到的范围：`web`（前端相关）、`pipeline`（管线相关）
- 近期示例：
  - `chore: 清理截图、更新资源文件和 gitignore`
  - `fix(web): 首页统一 subtitle + 语言切换图标化 + 配色按钮 cursor-pointer`
  - `fix(web): Streamgraph x 轴层级修复`
  - `chore: 许可证从 MIT 更改为 BSL 1.1 + README 更新`

**分支风格：** Trunk-based（单一 `main` 分支，无特性分支）

## Vue 组件约定

**Script Setup：**
- 全部使用 `<script setup lang="ts">`
- Props 通过 `defineProps<T>()` 定义，使用接口类型
- Emits 通过 `defineEmits<{ ... }>()` 定义，带类型化的事件签名
- Expose 通过 `defineExpose({ ... })` 供父组件访问（如 `Streamgraph.vue` 中的 `getSvg`）

**组合式函数：**
- 命名 `useXxx`，返回响应式值（`ref`、`computed`）或纯函数结果
- 位置：`apps/web/app/composables/`
- 示例：`useContributorColors.ts`、`useProjectData.ts`、`useStaticData.ts`、`useAppSettings.ts`

**模板模式：**
- Tailwind CSS 工具类（Unocss 已禁用，使用 Tailwind v4）
- `v-if`/`v-else-if`/`v-else` 条件渲染
- `v-model` 双向绑定
- `@click` / `@hover` 事件处理
- `role`、`aria-label`、`aria-orientation` 等无障碍属性

## 函数设计

**尺寸：** 通常较小，单一职责函数（5–30 行）

**参数：**
- 简单函数使用扁平参数列表
- 可配置函数使用选项对象：`{ batchSize, force, incremental }`

**返回值：**
- 直接返回数据数组或对象
- 流式解析操作使用异步生成器（`AsyncGenerator<T>`）
- 键值查找使用 `Map<K, V>`（如颜色映射）

## 常量与配置

**导出常量：**
- 使用 `UPPER_SNAKE_CASE` 命名导出常量（如 `OTHERS_LABEL`、`BACKEND_TOP_LIMIT`、`TOP_N_MAX`）
- 位置：与相关逻辑同文件或同模块

---

*规范分析：2026-04-23*
