import type { HealthStatsInput } from '../app/utils/healthRules'
import { Buffer } from 'node:buffer'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { deflateSync } from 'node:zlib'
import { Pool } from 'pg'
import { BACKEND_TOP_LIMIT } from '../app/composables/useStreamgraphData'
import { evaluateHealthRules } from '../app/utils/healthRules'

// ── Load .env ──
const envPath = path.resolve(new URL(import.meta.url).pathname, '../../.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const eq = trimmed.indexOf('=')
    if (eq < 0)
      continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key])
      process.env[key] = val
  }
}

// ── Demo projects configuration ──

const DEMO_PROJECTS = [
  { fullName: 'vuejs/core', name: 'core' },
  { fullName: 'facebook/react', name: 'react' },
  { fullName: 'jquery/jquery', name: 'jquery' },
  { fullName: 'atom/atom', name: 'atom' },
] as const

const REPOS_DIR = process.env.REPOS_DIR
  ?? path.join(os.homedir(), '.project-river', 'repos')

// ── DB row types ──

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

interface ProjectDataBundle {
  project: {
    id: number
    name: string
    path: string
    url: string | null
    fullName: string | null
    status: string
    description: string | null
    lastAnalyzedAt: string | null
    errorMessage: string | null
    createdAt: string
  }
  daily: DailyExportRow[]
  monthly: MonthlyExportRow[]
  health: { signals: any[] }
}

// ── Columnar conversion (reduces JSON key overhead) ──

/** Convert array-of-objects to object-of-arrays */
function toColumnar<T extends Record<string, any>>(rows: T[]): Record<string, any[]> {
  if (rows.length === 0)
    return {}
  const keys = Object.keys(rows[0]!)
  const result: Record<string, any[]> = {}
  for (const k of keys)
    result[k] = rows.map(r => r[k])
  return result
}

// ── Git helpers ──

/** Clone or pull a repo. Returns the local path. */
function cloneOrPullRepo(fullName: string, name: string): string {
  const repoDir = path.join(REPOS_DIR, name)
  const url = `https://github.com/${fullName}.git`

  if (fs.existsSync(path.join(repoDir, '.git'))) {
    console.log(`  git pull ${name}...`)
    execSync(`git -C "${repoDir}" pull --ff-only`, { stdio: 'inherit' })
  }
  else {
    console.log(`  git clone ${fullName}...`)
    fs.mkdirSync(REPOS_DIR, { recursive: true })
    execSync(`git clone --progress "${url}" "${repoDir}"`, { stdio: 'inherit' })
  }

  return repoDir
}

/** Run incremental analysis via the pipeline CLI */
function runAnalysis(repoPath: string, fullName: string): void {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname)
  const cliPath = path.resolve(scriptDir, '../../../packages/pipeline/src/cli.ts')
  console.log(`  analyzing ${fullName} (incremental)...`)
  const start = Date.now()
  execSync(`bun "${cliPath}" "${repoPath}" "${fullName}" --incremental`, {
    stdio: 'inherit',
    env: { ...process.env },
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`  analysis done (${elapsed}s)`)
}

// ── Data export ──

async function exportProjectData(pool: Pool, fullName: string): Promise<ProjectDataBundle | null> {
  const { rows: projectRows } = await pool.query<ProjectRow>(
    'SELECT * FROM projects WHERE full_name = $1 OR (full_name IS NULL AND name = $1) LIMIT 1',
    [fullName],
  )

  if (projectRows.length === 0) {
    console.error(`  SKIP: "${fullName}" not found in database.`)
    return null
  }

  const project = projectRows[0]!

  if (project.status !== 'ready') {
    console.error(`  SKIP: "${fullName}" status="${project.status}", expected "ready".`)
    return null
  }

  const projectId = project.id
  console.log(`  exporting data for ${fullName} (id=${projectId})...`)

  // Daily aggregated data
  const { rows: dailyRows } = await pool.query<DailyExportRow>(`
    WITH ds_filtered AS (
      SELECT date, contributor, commits, insertions, deletions, files_touched
      FROM daily_stats WHERE project_id = $1
    ),
    sd_filtered AS (
      SELECT date, contributor, cumulative_commits
      FROM sum_day WHERE project_id = $1
    ),
    contributor_totals AS (
      SELECT contributor, SUM(commits) AS total_commits
      FROM ds_filtered GROUP BY contributor
    ),
    top_contributors AS (
      SELECT contributor FROM contributor_totals
      ORDER BY total_commits DESC, contributor ASC LIMIT ${BACKEND_TOP_LIMIT}
    ),
    classified AS (
      SELECT
        ds.date,
        CASE WHEN tc.contributor IS NOT NULL THEN ds.contributor
             ELSE 'Other contributors' END AS contributor,
        ds.commits, ds.insertions, ds.deletions, ds.files_touched,
        COALESCE(sd.cumulative_commits, 0) AS cumulative_commits
      FROM ds_filtered ds
      LEFT JOIN sd_filtered sd ON sd.date = ds.date AND sd.contributor = ds.contributor
      LEFT JOIN top_contributors tc ON tc.contributor = ds.contributor
    )
    SELECT date, contributor,
      SUM(commits)::int AS "commits",
      SUM(insertions)::int AS "linesAdded",
      SUM(deletions)::int AS "linesDeleted",
      SUM(files_touched)::int AS "filesTouched",
      SUM(cumulative_commits)::int AS "cumulativeCommits"
    FROM classified
    GROUP BY date, contributor
    ORDER BY date ASC, contributor ASC
  `, [projectId])

  // Monthly data
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

  // Health signals
  const { rows: healthRows } = await pool.query<HealthExportRow>(
    'SELECT date, contributor, commits, insertions, deletions FROM daily_stats WHERE project_id = $1',
    [projectId],
  )
  const healthSignals = computeHealthSignals(healthRows)

  return {
    project: {
      id: project.id,
      name: project.name,
      path: project.path,
      url: project.url,
      fullName: project.full_name ?? fullName,
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
}

// ── Health signal computation ──

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

    if (rowMs >= cutoff90d)
      recent90Commits += row.commits

    if (rowMs < cutoff90d && rowMs >= cutoff360d)
      priorDayTotals.set(row.date, (priorDayTotals.get(row.date) || 0) + row.commits)

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
    if (getYearQuarter(row.date) === quarter)
      set.add(row.contributor)
  }
  return set.size
}

// ── Main ──

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const bundles: ProjectDataBundle[] = []

    for (const { fullName, name } of DEMO_PROJECTS) {
      console.log(`\n── ${fullName} ──`)
      try {
        // Step 1: clone or pull
        const repoPath = cloneOrPullRepo(fullName, name)

        // Step 2: incremental analysis
        runAnalysis(repoPath, fullName)

        // Step 3: export data
        const bundle = await exportProjectData(pool, fullName)
        if (bundle) {
          const dailyCount = bundle.daily.length
          const monthlyCount = bundle.monthly.length
          console.log(`  ✓ exported (${dailyCount} daily rows, ${monthlyCount} monthly rows)`)
          bundles.push(bundle)
        }
      }
      catch (err: any) {
        console.error(`  ✗ failed: ${err.message}`)
      }
    }

    if (bundles.length === 0) {
      console.error('\nAll projects failed. No demo.bin written.')
      process.exit(1)
    }

    // Convert row arrays to columnar format for smaller JSON
    const columnarBundles = bundles.map(b => ({
      project: b.project,
      daily: toColumnar(b.daily),
      monthly: toColumnar(b.monthly),
      health: b.health,
    }))

    // Assemble multi-project bundle (v2 = columnar format)
    const output = { version: 2 as const, projects: columnarBundles }
    const json = JSON.stringify(output)
    const jsonSize = Buffer.byteLength(json)
    console.log(`\nBundle: ${bundles.length}/${DEMO_PROJECTS.length} projects, ${(jsonSize / 1024 / 1024).toFixed(2)} MB JSON`)

    // Compress and write
    const compressed = deflateSync(Buffer.from(json, 'utf-8'))
    const outputPath = new URL('../public/data/demo.bin', import.meta.url)
    fs.mkdirSync(new URL('../public/data', import.meta.url), { recursive: true })
    fs.writeFileSync(outputPath, compressed)

    console.log(`Written: ${outputPath.pathname} (${(compressed.length / 1024).toFixed(0)} KB, ratio: ${((1 - compressed.length / jsonSize) * 100).toFixed(1)}%)`)
  }
  finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Export failed:', err)
  process.exit(1)
})
