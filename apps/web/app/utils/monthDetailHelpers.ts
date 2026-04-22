import type { DailyRow } from './d3Helpers'

export interface MonthContributor {
  contributor: string
  monthlyCommits: number
  cumulativeCommits: number
  color: string
}

export interface MonthlyRow {
  yearMonth: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
}

export function getMonthCumulative(rows: DailyRow[], yearMonth: string, contributor: string): number {
  const matching = rows.filter(r => r.contributor === contributor && r.date.startsWith(`${yearMonth}-`))
  if (matching.length === 0)
    return 0
  matching.sort((a, b) => b.date.localeCompare(a.date))
  return matching[0]!.cumulativeCommits
}

export function getMonthContributors(
  monthlyRows: MonthlyRow[],
  dailyRows: DailyRow[],
  yearMonth: string,
  colorMap: Map<string, string>,
): MonthContributor[] {
  const filtered = monthlyRows.filter(r => r.yearMonth === yearMonth)
  const map = new Map<string, MonthContributor>()

  for (const row of filtered) {
    map.set(row.contributor, {
      contributor: row.contributor,
      monthlyCommits: row.commits,
      cumulativeCommits: getMonthCumulative(dailyRows, yearMonth, row.contributor),
      color: colorMap.get(row.contributor) ?? '#999',
    })
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.monthlyCommits !== a.monthlyCommits) {
      return b.monthlyCommits - a.monthlyCommits
    }
    return a.contributor.localeCompare(b.contributor)
  })
}

export function getRangeContributors(
  dailyRows: DailyRow[],
  startDate: string,
  endDate: string,
  colorMap: Map<string, string>,
): MonthContributor[] {
  // 区间提交数 — only from in-range rows
  const inRange = dailyRows.filter(r => r.date >= startDate && r.date <= endDate)
  const commitsMap = new Map<string, number>()
  for (const row of inRange) {
    commitsMap.set(row.contributor, (commitsMap.get(row.contributor) || 0) + row.commits)
  }

  // 总计 — all-time cumulative from ALL rows (not affected by range)
  const latestDateMap = new Map<string, string>()
  const cumulativeMap = new Map<string, number>()
  for (const row of dailyRows) {
    const existing = latestDateMap.get(row.contributor)
    if (!existing || row.date > existing) {
      latestDateMap.set(row.contributor, row.date)
      cumulativeMap.set(row.contributor, row.cumulativeCommits)
    }
  }

  const result: MonthContributor[] = []
  for (const [contributor, rangeCommits] of commitsMap) {
    result.push({
      contributor,
      monthlyCommits: rangeCommits,
      cumulativeCommits: cumulativeMap.get(contributor) || 0,
      color: colorMap.get(contributor) ?? '#999',
    })
  }

  return result.sort((a, b) => {
    if (b.monthlyCommits !== a.monthlyCommits)
      return b.monthlyCommits - a.monthlyCommits
    return a.contributor.localeCompare(b.contributor)
  })
}

export function getRangeCommits(dailyRows: DailyRow[], startDate: string, endDate: string): number {
  return dailyRows.reduce((sum, r) => {
    if (r.date >= startDate && r.date <= endDate)
      return sum + r.commits
    return sum
  }, 0)
}

/** Compute contributors for a single month from daily rows only (no MonthlyRow dependency). */
export function getMonthContributorsFromDaily(
  dailyRows: DailyRow[],
  yearMonth: string,
  colorMap: Map<string, string>,
): MonthContributor[] {
  return getRangeContributors(dailyRows, `${yearMonth}-01`, `${yearMonth}-31`, colorMap)
}

/** Compute all-time contributors from daily rows only (no MonthlyRow dependency). */
export function getAllContributorsFromDaily(
  dailyRows: DailyRow[],
  colorMap: Map<string, string>,
): MonthContributor[] {
  const commitsMap = new Map<string, number>()
  const latestDateMap = new Map<string, string>()
  const cumulativeMap = new Map<string, number>()

  for (const row of dailyRows) {
    commitsMap.set(row.contributor, (commitsMap.get(row.contributor) || 0) + row.commits)
    const existing = latestDateMap.get(row.contributor)
    if (!existing || row.date > existing) {
      latestDateMap.set(row.contributor, row.date)
      cumulativeMap.set(row.contributor, row.cumulativeCommits)
    }
  }

  const result: MonthContributor[] = []
  for (const [contributor, totalCommits] of commitsMap) {
    result.push({
      contributor,
      monthlyCommits: totalCommits,
      cumulativeCommits: cumulativeMap.get(contributor) || 0,
      color: colorMap.get(contributor) ?? '#999',
    })
  }

  return result.sort((a, b) => {
    if (b.monthlyCommits !== a.monthlyCommits)
      return b.monthlyCommits - a.monthlyCommits
    return a.contributor.localeCompare(b.contributor)
  })
}

export function getAllContributors(
  monthlyRows: MonthlyRow[],
  dailyRows: DailyRow[],
  colorMap: Map<string, string>,
): MonthContributor[] {
  const monthlyMap = new Map<string, number>()
  for (const row of monthlyRows) {
    monthlyMap.set(row.contributor, (monthlyMap.get(row.contributor) || 0) + row.commits)
  }

  const latestDateMap = new Map<string, string>()
  const cumulativeMap = new Map<string, number>()
  for (const row of dailyRows) {
    const existingDate = latestDateMap.get(row.contributor)
    if (existingDate === undefined || row.date.localeCompare(existingDate) > 0) {
      latestDateMap.set(row.contributor, row.date)
      cumulativeMap.set(row.contributor, row.cumulativeCommits)
    }
  }

  const result: MonthContributor[] = []
  for (const [contributor, monthlyCommits] of monthlyMap) {
    result.push({
      contributor,
      monthlyCommits,
      cumulativeCommits: cumulativeMap.get(contributor) || 0,
      color: colorMap.get(contributor) ?? '#999',
    })
  }

  return result.sort((a, b) => {
    if (b.monthlyCommits !== a.monthlyCommits) {
      return b.monthlyCommits - a.monthlyCommits
    }
    return a.contributor.localeCompare(b.contributor)
  })
}
