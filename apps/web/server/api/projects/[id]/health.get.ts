import type { HealthStatsInput } from '../../../../app/utils/healthRules'
import { db } from '@project-river/db/client'
import { daily_stats } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { evaluateHealthRules } from '../../../../app/utils/healthRules'

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const rows = await db
    .select()
    .from(daily_stats)
    .where(eq(daily_stats.projectId, projectId))

  if (rows.length === 0) {
    return { signals: [] }
  }

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

  // Quarterly contributor counts
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

  return { signals: evaluateHealthRules(stats) }
})

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
