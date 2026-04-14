import type { DailyStatsRow } from '../../../utils/projectStats'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, getValidatedQuery } from 'h3'
import {
  assertProjectExists,
  buildDailyDateBounds,
  dailyQuerySchema,

} from '../../../utils/projectStats'

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const { start, end, limit, offset } = await getValidatedQuery(event, dailyQuerySchema.parse)
  await assertProjectExists(projectId)

  const { startDate, endDate } = buildDailyDateBounds(projectId, start, end)

  const result = await db.execute(sql`
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
    LIMIT ${limit} OFFSET ${offset}
  `)

  return result.rows.map(r => ({
    date: String(r.date),
    contributor: String(r.contributor),
    commits: Number(r.commits),
    linesAdded: Number(r.linesAdded),
    linesDeleted: Number(r.linesDeleted),
    filesTouched: Number(r.filesTouched),
    cumulativeCommits: Number(r.cumulativeCommits),
  })) satisfies DailyStatsRow[]
})
