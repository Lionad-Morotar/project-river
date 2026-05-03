import type { DailyRow, ProjectEvent } from '~/server/utils/detectProjectEvents'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { detectEvents } from '~/server/utils/detectProjectEvents'
import { assertProjectExists, buildDailyDateBounds } from '~/server/utils/projectStats'

/** queryProjectEvents zod schema — 入参校验 */
export const queryProjectEventsSchema = z.object({
  typeFilter: z.array(z.enum([
    'contributor_first_commit',
    'contributor_exit',
    'activity_spike',
    'activity_drop',
    'major_refactor',
    'commit_milestone',
    'project_start',
    'project_archived',
  ])).optional(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
})

export type QueryProjectEventsInput = z.infer<typeof queryProjectEventsSchema>

/**
 * queryProjectEvents — 项目事件查询
 *
 * 查询 daily_stats + sum_day 获取 DailyRow[]，
 * 调用 detectEvents 纯函数检测事件，
 * 支持 typeFilter 和 dateRange 过滤。
 */
export async function queryProjectEvents(
  projectId: number,
  params: QueryProjectEventsInput,
): Promise<ProjectEvent[]> {
  await assertProjectExists(projectId)
  const parsed = queryProjectEventsSchema.parse(params)
  const { typeFilter, dateRange } = parsed

  // ── 1. 获取 DailyRow[] 数据 ──
  const { startDate, endDate } = buildDailyDateBounds(
    projectId,
    dateRange?.start,
    dateRange?.end,
  )

  const result = await db.execute<{
    date: string
    contributor: string
    commits: number
    linesAdded: number
    linesDeleted: number
    filesTouched: number
    cumulativeCommits: number
  }>(sql`
    WITH bounds AS (
      SELECT
        COALESCE(${startDate}, CURRENT_DATE) AS min_date,
        COALESCE(${endDate}, CURRENT_DATE) AS max_date
    ),
    ds_filtered AS (
      SELECT date, contributor, commits, insertions, deletions, files_touched
      FROM daily_stats
      WHERE project_id = ${projectId}
        AND date >= (SELECT min_date FROM bounds)
        AND date <= (SELECT max_date FROM bounds)
    ),
    sd_filtered AS (
      SELECT date, contributor, cumulative_commits
      FROM sum_day
      WHERE project_id = ${projectId}
        AND date >= (SELECT min_date FROM bounds)
        AND date <= (SELECT max_date FROM bounds)
    )
    SELECT
      ds.date AS "date",
      ds.contributor AS "contributor",
      COALESCE(ds.commits, 0) AS "commits",
      COALESCE(ds.insertions, 0) AS "linesAdded",
      COALESCE(ds.deletions, 0) AS "linesDeleted",
      COALESCE(ds.files_touched, 0) AS "filesTouched",
      COALESCE(sd.cumulative_commits, 0) AS "cumulativeCommits"
    FROM ds_filtered ds
    LEFT JOIN sd_filtered sd
      ON sd.date = ds.date
     AND sd.contributor = ds.contributor
    ORDER BY ds.date ASC, ds.contributor ASC
  `)

  const dailyRows: DailyRow[] = result.rows.map(r => ({
    date: String(r.date),
    contributor: String(r.contributor),
    commits: Number(r.commits),
    linesAdded: Number(r.linesAdded),
    linesDeleted: Number(r.linesDeleted),
    filesTouched: Number(r.filesTouched),
    cumulativeCommits: Number(r.cumulativeCommits),
  }))

  // ── 2. 调用 detectEvents 纯函数 ──
  let events = detectEvents(dailyRows)

  // ── 3. typeFilter 过滤 ──
  if (typeFilter && typeFilter.length > 0) {
    const allowed = new Set<string>(typeFilter)
    events = events.filter(e => allowed.has(e.type))
  }

  // ── 4. dateRange 过滤（对事件日期做二次过滤，确保精确） ──
  if (dateRange) {
    events = events.filter((e) => {
      return e.date >= dateRange.start && e.date <= dateRange.end
    })
  }

  return events
}
