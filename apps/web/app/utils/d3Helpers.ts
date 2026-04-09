import { stack as d3Stack, stackOffsetWiggle, stackOrderInsideOut } from 'd3-shape'

export interface DailyRow {
  date: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  cumulativeCommits: number
}

export interface PivotedRow {
  date: Date
  [contributor: string]: number | Date
}

export function pivotDailyData(rows: DailyRow[]): PivotedRow[] {
  const dateSet = new Set<string>()
  const contributorSet = new Set<string>()

  for (const row of rows) {
    dateSet.add(row.date)
    contributorSet.add(row.contributor)
  }

  const dates = Array.from(dateSet).sort()
  const contributors = Array.from(contributorSet).sort()

  const pivotMap = new Map<string, PivotedRow>()

  for (const row of rows) {
    let pivoted = pivotMap.get(row.date)
    if (!pivoted) {
      pivoted = { date: new Date(row.date) } as PivotedRow
      pivotMap.set(row.date, pivoted)
    }
    pivoted[row.contributor] = row.commits || 0
  }

  return dates.map((date) => {
    const base = pivotMap.get(date) || { date: new Date(date) }
    const result: PivotedRow = { date: base.date }
    for (const c of contributors) {
      result[c] = (base as PivotedRow)[c] || 0
    }
    return result
  })
}

export function buildStack(contributors: string[], data: PivotedRow[]) {
  return d3Stack()
    .keys(contributors)
    .order(stackOrderInsideOut)
    .offset(stackOffsetWiggle)(data)
}
