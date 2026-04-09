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
  return matching[0].cumulativeCommits
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
