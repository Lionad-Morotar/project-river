import type { HealthStatsInput } from '../app/utils/healthRules'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { deflateSync } from 'node:zlib'
import { Pool } from 'pg'
import { evaluateHealthRules } from '../app/utils/healthRules'

const DEMO_PROJECT_NAME = process.env.DEMO_PROJECT_NAME ?? 'facebook/react'

interface ProjectRow {
  id: number
  name: string
  path: string
  url: string | null
  full_name: string | null
  status: string
  description: string | null
  last_analyzed_at: Date | null
  error_message: string | null
  created_at: Date
}

interface DailyExportRow {
  date: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  cumulativeCommits: number
}

interface MonthlyExportRow {
  yearMonth: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
}

interface HealthExportRow {
  date: string
  contributor: string
  commits: number
  insertions: number
  deletions: number
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // 1. Find project by fullName
    const { rows: projectRows } = await pool.query<ProjectRow>(
      'SELECT * FROM projects WHERE full_name = $1 LIMIT 1',
      [DEMO_PROJECT_NAME],
    )

    if (projectRows.length === 0) {
      console.error(`Project "${DEMO_PROJECT_NAME}" not found in database.`)
      console.error('Run pipeline analysis first, or set DEMO_PROJECT_NAME.')
      process.exit(1)
    }

    const project = projectRows[0]!
    const projectId = project.id

    console.log(`Found project: ${project.full_name ?? project.name} (id=${projectId}, status=${project.status})`)

    if (project.status !== 'ready') {
      console.error(`Project status is "${project.status}", expected "ready".`)
      process.exit(1)
    }

    // 2. Export daily aggregated data (mirrors daily-aggregated.get.ts SQL)
    console.log('Exporting daily aggregated data...')
    const { rows: dailyRows } = await pool.query<DailyExportRow>(`
      WITH ds_filtered AS (
        SELECT date, contributor, commits, insertions, deletions, files_touched
        FROM daily_stats
        WHERE project_id = $1
      ),
      sd_filtered AS (
        SELECT date, contributor, cumulative_commits
        FROM sum_day
        WHERE project_id = $1
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
        LIMIT 49
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
          ON sd.date = ds.date AND sd.contributor = ds.contributor
        LEFT JOIN top_contributors tc
          ON tc.contributor = ds.contributor
      )
      SELECT
        date,
        contributor,
        SUM(commits)::int AS "commits",
        SUM(insertions)::int AS "linesAdded",
        SUM(deletions)::int AS "linesDeleted",
        SUM(files_touched)::int AS "filesTouched",
        SUM(cumulative_commits)::int AS "cumulativeCommits"
      FROM classified
      GROUP BY date, contributor
      ORDER BY date ASC, contributor ASC
    `, [projectId])

    // 3. Export monthly data (mirrors monthly.get.ts SQL)
    console.log('Exporting monthly data...')
    const { rows: monthlyRows } = await pool.query<MonthlyExportRow>(`
      SELECT
        to_char(ds.date, 'YYYY-MM') AS "yearMonth",
        ds.contributor AS "contributor",
        COALESCE(SUM(ds.commits), 0)::int AS "commits",
        COALESCE(SUM(ds.insertions), 0)::int AS "linesAdded",
        COALESCE(SUM(ds.deletions), 0)::int AS "linesDeleted",
        COALESCE(SUM(ds.files_touched), 0)::int AS "filesTouched"
      FROM daily_stats ds
      WHERE ds.project_id = $1
      GROUP BY to_char(ds.date, 'YYYY-MM'), ds.contributor
      ORDER BY to_char(ds.date, 'YYYY-MM') ASC, ds.contributor ASC
    `, [projectId])

    // 4. Export health data (mirrors health.get.ts logic)
    console.log('Computing health signals...')
    const { rows: healthRows } = await pool.query<HealthExportRow>(`
      SELECT date, contributor, commits, insertions, deletions
      FROM daily_stats
      WHERE project_id = $1
    `, [projectId])

    const healthSignals = computeHealthSignals(healthRows)

    // 5. Assemble bundle
    const bundle = {
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        url: project.url,
        fullName: project.full_name,
        status: project.status,
        description: project.description,
        lastAnalyzedAt: project.last_analyzed_at?.toISOString() ?? null,
        errorMessage: project.error_message,
        createdAt: project.created_at.toISOString(),
      },
      daily: dailyRows,
      monthly: monthlyRows,
      health: { signals: healthSignals },
    }

    const json = JSON.stringify(bundle)
    const jsonSize = Buffer.byteLength(json)
    console.log(`Bundle JSON size: ${(jsonSize / 1024 / 1024).toFixed(2)} MB (${dailyRows.length} daily rows, ${monthlyRows.length} monthly rows)`)

    // 6. Compress and write
    const compressed = deflateSync(Buffer.from(json, 'utf-8'))
    const outputPath = new URL('../public/data/demo.bin', import.meta.url)
    const fs = await import('node:fs')
    fs.mkdirSync(new URL('../public/data', import.meta.url), { recursive: true })
    fs.writeFileSync(outputPath, compressed)

    console.log(`Written: ${outputPath.pathname} (${(compressed.length / 1024).toFixed(0)} KB, ratio: ${((1 - compressed.length / jsonSize) * 100).toFixed(1)}%)`)
  }
  finally {
    await pool.end()
  }
}

function computeHealthSignals(rows: HealthExportRow[]) {
  if (rows.length === 0)
    return []

  const now = Date.now()
  const ms90d = 90 * 86400000
  const ms270d = 270 * 86400000
  const cutoff90d = now - ms90d
  const cutoff360d = now - ms90d - ms270d

  let totalCommits = 0
  let totalLines = 0
  let recent90Commits = 0
  let lastDate: string | null = null
  let lastDateMs = 0

  const contributorMap = new Map<string, number>()
  const priorDayTotals = new Map<string, number>()

  for (const row of rows) {
    totalCommits += row.commits
    totalLines += row.insertions + row.deletions
    contributorMap.set(row.contributor, (contributorMap.get(row.contributor) || 0) + row.commits)

    const rowMs = new Date(row.date).getTime()

    if (rowMs >= cutoff90d) {
      recent90Commits += row.commits
    }

    if (rowMs < cutoff90d && rowMs >= cutoff360d) {
      priorDayTotals.set(row.date, (priorDayTotals.get(row.date) || 0) + row.commits)
    }

    if (rowMs > lastDateMs) {
      lastDateMs = rowMs
      lastDate = row.date
    }
  }

  const topContributors = Array.from(contributorMap.entries())
    .map(([contributor, commits]) => ({ contributor, commits }))
    .sort((a, b) => b.commits - a.commits)

  const priorDayValues = Array.from(priorDayTotals.values())
  const prior270DaysDailyAvg = priorDayValues.length > 0
    ? priorDayValues.reduce((sum, v) => sum + v, 0) / priorDayValues.length
    : 0

  const daysSinceLastCommit = lastDateMs > 0
    ? Math.floor((now - lastDateMs) / 86400000)
    : null

  const recentQ = currentQuarter()
  const previousQ = previousQuarter()
  const recentQuarterContributors = countContributorsInQuarter(rows, recentQ)
  const previousQuarterContributors = countContributorsInQuarter(rows, previousQ)

  const stats: HealthStatsInput = {
    totalCommits,
    totalContributors: contributorMap.size,
    topContributors,
    lastDate,
    recent90DaysCommits: recent90Commits,
    prior270DaysDailyAvg,
    avgLinesPerCommit: totalCommits > 0 ? totalLines / totalCommits : 0,
    recentQuarterContributors,
    previousQuarterContributors,
    daysSinceLastCommit,
  }

  return evaluateHealthRules(stats)
}

function currentQuarter(): string {
  const d = new Date()
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

function previousQuarter(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

function getYearQuarter(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

function countContributorsInQuarter(rows: Array<{ date: string, contributor: string }>, quarter: string): number {
  const set = new Set<string>()
  for (const row of rows) {
    if (getYearQuarter(row.date) === quarter) {
      set.add(row.contributor)
    }
  }
  return set.size
}

main().catch((err) => {
  console.error('Export failed:', err)
  process.exit(1)
})
