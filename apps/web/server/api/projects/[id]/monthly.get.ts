import type { MonthlyStatsRow } from '../../../utils/projectStats'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, getValidatedQuery } from 'h3'
import {
  assertProjectExists,
  buildMonthlyDateBounds,
  monthlyQuerySchema,

} from '../../../utils/projectStats'

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const { start, end, limit, offset } = await getValidatedQuery(event, monthlyQuerySchema.parse)
  await assertProjectExists(projectId)

  const { startDate, endDate } = buildMonthlyDateBounds(projectId, start, end)

  const result = await db.execute(sql`
    WITH bounds AS (
      SELECT
        COALESCE(${startDate}, CURRENT_DATE) AS min_date,
        COALESCE(${endDate}, CURRENT_DATE) AS max_date
    ),
    contributors AS (
      SELECT DISTINCT contributor FROM daily_stats WHERE project_id = ${projectId}
    ),
    month_range AS (
      SELECT to_char(generate_series(min_date, max_date, '1 month'::interval), 'YYYY-MM') AS year_month
      FROM bounds
    ),
    grid AS (
      SELECT m.year_month, c.contributor
      FROM month_range m
      CROSS JOIN contributors c
    ),
    ds_filtered AS (
      SELECT date, contributor, commits, insertions, deletions, files_touched
      FROM daily_stats
      WHERE project_id = ${projectId}
        AND date >= (SELECT min_date FROM bounds)
        AND date <= (SELECT max_date FROM bounds)
    )
    SELECT
      g.year_month AS "yearMonth",
      g.contributor AS "contributor",
      COALESCE(SUM(ds.commits), 0) AS "commits",
      COALESCE(SUM(ds.insertions), 0) AS "linesAdded",
      COALESCE(SUM(ds.deletions), 0) AS "linesDeleted",
      COALESCE(SUM(ds.files_touched), 0) AS "filesTouched"
    FROM grid g
    LEFT JOIN ds_filtered ds
      ON to_char(ds.date, 'YYYY-MM') = g.year_month
     AND ds.contributor = g.contributor
    GROUP BY g.year_month, g.contributor
    ORDER BY g.year_month ASC, g.contributor ASC
    LIMIT ${limit} OFFSET ${offset}
  `)

  return result.rows.map(r => ({
    yearMonth: String(r.yearMonth),
    contributor: String(r.contributor),
    commits: Number(r.commits),
    linesAdded: Number(r.linesAdded),
    linesDeleted: Number(r.linesDeleted),
    filesTouched: Number(r.filesTouched),
  })) satisfies MonthlyStatsRow[]
})
