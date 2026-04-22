import type { DailyStatsRow } from '../../../utils/projectStats'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, getValidatedQuery, setResponseHeader } from 'h3'
import { BACKEND_TOP_LIMIT } from '../../../../app/composables/useStreamgraphData'
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
    ),
    contributor_totals AS (
      SELECT contributor, SUM(commits) AS total_commits
      FROM ds_filtered
      GROUP BY contributor
    ),
    top_contributors AS (
      SELECT contributor
      FROM contributor_totals
      ORDER BY total_commits DESC, contributor ASC
      LIMIT ${BACKEND_TOP_LIMIT}
    ),
    classified AS (
      SELECT
        ds.date,
        CASE
          WHEN tc.contributor IS NOT NULL THEN ds.contributor
          ELSE 'Other contributors'
        END AS contributor,
        ds.commits,
        ds.insertions,
        ds.deletions,
        ds.files_touched,
        COALESCE(sd.cumulative_commits, 0) AS cumulative_commits
      FROM ds_filtered ds
      LEFT JOIN sd_filtered sd
        ON sd.date = ds.date
       AND sd.contributor = ds.contributor
      LEFT JOIN top_contributors tc
        ON tc.contributor = ds.contributor
    )
    SELECT
      date AS "date",
      contributor AS "contributor",
      SUM(commits) AS "commits",
      SUM(insertions) AS "linesAdded",
      SUM(deletions) AS "linesDeleted",
      SUM(files_touched) AS "filesTouched",
      SUM(cumulative_commits) AS "cumulativeCommits"
    FROM classified
    GROUP BY date, contributor
    ORDER BY date ASC, contributor ASC
    LIMIT ${limit} OFFSET ${offset}
  `)

  const rows = result.rows.map(r => ({
    date: String(r.date),
    contributor: String(r.contributor),
    commits: Number(r.commits),
    linesAdded: Number(r.linesAdded),
    linesDeleted: Number(r.linesDeleted),
    filesTouched: Number(r.filesTouched),
    cumulativeCommits: Number(r.cumulativeCommits),
  })) satisfies DailyStatsRow[]

  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return rows
})
