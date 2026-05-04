import { assertProjectExists } from '#server/utils/projectStats'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

/** queryCommitsByPath zod schema — 入参校验 */
export const queryCommitsByPathSchema = z.object({
  pathPrefix: z.string().min(1),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  limit: z.number().int().min(1).max(500).default(100),
})

export type QueryCommitsByPathInput = z.infer<typeof queryCommitsByPathSchema>

/** queryCommitsByPath 返回的 commit 行 */
export interface CommitByPathRow {
  sha: string
  date: string
  author: string
  files: string[]
  message: string
}

/** message 截断长度 */
const MESSAGE_MAX_LENGTH = 200

/**
 * queryCommitsByPath — 按文件路径前缀查 commits
 *
 * JOIN commit_files + commits，WHERE path LIKE 'prefix%' (prefix-only LIKE)
 * GROUP BY commit，message 截断 200 字符。
 */
export async function queryCommitsByPath(
  projectId: number,
  params: QueryCommitsByPathInput,
): Promise<CommitByPathRow[]> {
  await assertProjectExists(projectId)
  const parsed = queryCommitsByPathSchema.parse(params)
  const { pathPrefix, dateRange, limit } = parsed

  // ── 1. 构建日期过滤条件 ──
  const dateCondition = dateRange
    ? sql`AND c.committer_date >= ${dateRange.start}::timestamptz AND c.committer_date <= ${dateRange.end}::timestamptz`
    : sql``

  // ── 2. JOIN commit_files + commits，prefix-only LIKE ──
  const result = await db.execute<{
    sha: string
    date: string
    author: string
    message: string | null
    files: string
  }>(sql`
    SELECT
      c.hash AS sha,
      c.committer_date::date AS "date",
      c.author_name AS author,
      c.message,
      STRING_AGG(cf.path, ',' ORDER BY cf.path) AS files
    FROM commits c
    JOIN commit_files cf ON cf.commit_id = c.id
    WHERE c.project_id = ${projectId}
      AND cf.project_id = ${projectId}
      AND cf.path LIKE ${`${pathPrefix}%`}
      ${dateCondition}
    GROUP BY c.hash, c.committer_date, c.author_name, c.message
    ORDER BY c.committer_date DESC
    LIMIT ${limit}
  `)

  // ── 3. 组装返回，message 截断 200 字符 ──
  return result.rows.map(r => ({
    sha: r.sha,
    date: String(r.date),
    author: r.author,
    files: r.files ? r.files.split(',') : [],
    message: truncateMessage(r.message ?? ''),
  }))
}

/** 截断 message 到 200 字符 */
function truncateMessage(message: string): string {
  if (message.length <= MESSAGE_MAX_LENGTH)
    return message
  return message.substring(0, MESSAGE_MAX_LENGTH)
}
