import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'

export async function generateSumDay(projectId: number): Promise<void> {
  await db.execute(sql`DELETE FROM sum_day WHERE project_id = ${projectId}`)
  await db.execute(sql`
    WITH daily AS (
      SELECT project_id, date, contributor, commits, insertions, deletions
      FROM daily_stats
      WHERE project_id = ${projectId}
    ),
    cumulative AS (
      SELECT
        project_id,
        date,
        contributor,
        SUM(commits) OVER (PARTITION BY contributor ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_commits,
        SUM(insertions) OVER (PARTITION BY contributor ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_insertions,
        SUM(deletions) OVER (PARTITION BY contributor ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_deletions
      FROM daily
    )
    INSERT INTO sum_day (project_id, date, contributor, cumulative_commits, cumulative_insertions, cumulative_deletions)
    SELECT * FROM cumulative;
  `)
}
