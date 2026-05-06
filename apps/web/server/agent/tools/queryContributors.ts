import { assertProjectExists } from '#server/utils/projectStats'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

/** queryContributors zod schema — 入参校验 */
export const queryContributorsSchema = z.object({
  filter: z.object({
    activeAfter: z.string().optional(),
    activeBefore: z.string().optional(),
    minCommits: z.number().int().min(0).optional(),
  }).optional(),
  sortBy: z.enum(['commits', 'recency', 'span']).default('commits'),
  limit: z.number().int().min(1).max(50).default(20),
})

export type QueryContributorsInput = z.infer<typeof queryContributorsSchema>

/** queryContributors 返回的 contributor 行 */
export interface ContributorRow {
  name: string
  email: string
  commits: number
  firstCommit: string
  lastCommit: string
  modules: string[]
}

/** queryContributors 完整返回结构 */
export interface QueryContributorsResult {
  /** 符合过滤条件的贡献者总数（不受 limit 截断影响） */
  totalCount: number
  /** 截断后的贡献者列表 */
  contributors: ContributorRow[]
}

/**
 * queryContributors — 贡献者排序查询
 *
 * daily_stats.contributor 字段存储的是 authorEmail（见 calcDay.ts）。
 * 查询流程：
 *   1. 从 daily_stats 按 contributor（email）聚合统计数据
 *   2. 应用过滤、排序、limit
 *   3. 从 commits 表查询每个 email 对应的 author_name（取最新一条）
 *   4. 从 commit_files 提取每个 email 的 top 5 模块路径段
 *   5. 组装返回，包含 totalCount 让 Agent 知道真实总数
 */
export async function queryContributors(
  projectId: number,
  params: QueryContributorsInput,
): Promise<QueryContributorsResult> {
  await assertProjectExists(projectId)
  const parsed = queryContributorsSchema.parse(params)
  const { filter, sortBy, limit } = parsed

  // ── 1. 从 daily_stats 按 contributor（email）聚合 ──
  const contributorAgg = await db.execute<{
    contributor: string
    totalCommits: number
    firstDate: string
    lastDate: string
  }>(sql`
    SELECT
      ds.contributor,
      SUM(ds.commits) AS "totalCommits",
      MIN(ds.date) AS "firstDate",
      MAX(ds.date) AS "lastDate"
    FROM daily_stats ds
    WHERE ds.project_id = ${projectId}
    GROUP BY ds.contributor
  `)

  let rows = contributorAgg.rows

  // ── 2. 过滤 ──
  if (filter?.activeAfter) {
    rows = rows.filter(r => r.lastDate >= filter.activeAfter!)
  }
  if (filter?.activeBefore) {
    rows = rows.filter(r => r.firstDate <= filter.activeBefore!)
  }
  if (filter?.minCommits !== undefined) {
    rows = rows.filter(r => r.totalCommits >= filter.minCommits!)
  }

  const filteredTotalCount = rows.length

  // ── 3. 排序 ──
  if (sortBy === 'commits') {
    rows.sort((a, b) => b.totalCommits - a.totalCommits || a.contributor.localeCompare(b.contributor))
  }
  else if (sortBy === 'recency') {
    rows.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.contributor.localeCompare(b.contributor))
  }
  else {
    // span: (lastDate - firstDate) DESC
    rows.sort((a, b) => {
      const spanA = daysDiff(a.firstDate, a.lastDate)
      const spanB = daysDiff(b.firstDate, b.lastDate)
      return spanB - spanA || a.contributor.localeCompare(b.contributor)
    })
  }

  // ── 4. 应用 limit ──
  rows = rows.slice(0, limit)

  if (rows.length === 0)
    return { totalCount: filteredTotalCount, contributors: [] }

  const contributorEmails = rows.map(r => r.contributor)

  // ── 5. 获取每个 email 对应的 author_name（从 commits 表取最新一条）──
  const nameRows = await db.execute<{ authorEmail: string, authorName: string }>(sql`
    SELECT DISTINCT ON (c.author_email)
      c.author_email AS "authorEmail",
      c.author_name AS "authorName"
    FROM commits c
    WHERE c.project_id = ${projectId}
      AND c.author_email IN ${contributorEmails}
    ORDER BY c.author_email, c.committer_date DESC
  `)
  const nameMap = new Map<string, string>()
  for (const n of nameRows.rows) {
    nameMap.set(n.authorEmail, n.authorName)
  }

  // ── 6. Modules 提取 — 从 commit_files 取每个 email 的 top 5 路径段 ──
  const moduleRows = await db.execute<{ authorEmail: string, pathPrefix: string, cnt: string }>(sql`
    SELECT
      c.author_email AS "authorEmail",
      CASE WHEN array_length(string_to_array(cf.path, '/'), 1) >= 2
        THEN split_part(cf.path, '/', 1) || '/' || split_part(cf.path, '/', 2)
        ELSE cf.path
      END AS "pathPrefix",
      COUNT(*) AS cnt
    FROM commit_files cf
    JOIN commits c ON c.id = cf.commit_id
    WHERE cf.project_id = ${projectId}
      AND c.author_email IN ${contributorEmails}
    GROUP BY c.author_email, "pathPrefix"
    ORDER BY c.author_email, cnt DESC
  `)

  const modulesMap = new Map<string, string[]>()
  for (const mr of moduleRows.rows) {
    const existing = modulesMap.get(mr.authorEmail) ?? []
    if (existing.length < 5)
      existing.push(mr.pathPrefix)
    modulesMap.set(mr.authorEmail, existing)
  }

  // ── 7. 组装返回 ──
  const contributors = rows.map(r => ({
    name: nameMap.get(r.contributor) ?? r.contributor,
    email: r.contributor,
    commits: r.totalCommits,
    firstCommit: r.firstDate,
    lastCommit: r.lastDate,
    modules: modulesMap.get(r.contributor) ?? [],
  }))

  return { totalCount: filteredTotalCount, contributors }
}

/** 计算两个日期字符串之间的天数差 */
function daysDiff(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.floor((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}
