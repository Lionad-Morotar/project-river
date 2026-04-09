import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, getValidatedQuery } from 'h3'
import { z } from 'zod'

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const { start, end, limit, offset } = await getValidatedQuery(event, querySchema.parse)

  const projectCheck = await db.execute(sql`SELECT 1 FROM projects WHERE id = ${projectId} LIMIT 1`)
  if (projectCheck.rowCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const result = await db.execute(sql`
    WITH bounds AS (
      SELECT
        COALESCE(${start ? sql`${start}::date` : sql`(SELECT MIN(date) FROM daily_stats WHERE project_id = ${projectId})`}, CURRENT_DATE) AS min_date,
        COALESCE(${end ? sql`${end}::date` : sql`(SELECT MAX(date) FROM daily_stats WHERE project_id = ${projectId})`}, CURRENT_DATE) AS max_date
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
    )
    SELECT
      g.year_month AS "yearMonth",
      g.contributor AS "contributor",
      COALESCE(SUM(ds.commits), 0) AS "commits",
      COALESCE(SUM(ds.insertions), 0) AS "linesAdded",
      COALESCE(SUM(ds.deletions), 0) AS "linesDeleted",
      COALESCE(SUM(ds.files_touched), 0) AS "filesTouched"
    FROM grid g
    LEFT JOIN daily_stats ds
      ON ds.project_id = ${projectId}
     AND to_char(ds.date, 'YYYY-MM') = g.year_month
     AND ds.contributor = g.contributor
    GROUP BY g.year_month, g.contributor
    ORDER BY g.year_month ASC, g.contributor ASC
    LIMIT ${limit} OFFSET ${offset}
  `)

  return result.rows.map((r: any) => ({
    yearMonth: r.yearMonth,
    contributor: r.contributor,
    commits: Number(r.commits),
    linesAdded: Number(r.linesAdded),
    linesDeleted: Number(r.linesDeleted),
    filesTouched: Number(r.filesTouched),
  }))
})
