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

export type Granularity = 'day' | 'week' | 'month'

/** Get the ISO week Monday date for a given date string */
function toWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
  return monday.toISOString().split('T')[0]!
}

/** Aggregate daily rows by granularity */
export function aggregateRows(rows: DailyRow[], granularity: Granularity): DailyRow[] {
  if (granularity === 'day')
    return rows

  const bucketMap = new Map<string, Map<string, DailyRow>>()

  for (const row of rows) {
    const bucket = granularity === 'week' ? toWeekKey(row.date) : row.date.substring(0, 7)
    let contributorMap = bucketMap.get(bucket)
    if (!contributorMap) {
      contributorMap = new Map()
      bucketMap.set(bucket, contributorMap)
    }

    const existing = contributorMap.get(row.contributor)
    if (existing) {
      existing.commits += row.commits
      existing.linesAdded += row.linesAdded
      existing.linesDeleted += row.linesDeleted
      existing.filesTouched += row.filesTouched
      if (row.cumulativeCommits > existing.cumulativeCommits)
        existing.cumulativeCommits = row.cumulativeCommits
    }
    else {
      contributorMap.set(row.contributor, {
        date: granularity === 'month' ? `${bucket}-01` : bucket,
        contributor: row.contributor,
        commits: row.commits,
        linesAdded: row.linesAdded,
        linesDeleted: row.linesDeleted,
        filesTouched: row.filesTouched,
        cumulativeCommits: row.cumulativeCommits,
      })
    }
  }

  const result: DailyRow[] = []
  for (const contributorMap of bucketMap.values()) {
    for (const row of contributorMap.values()) {
      result.push(row)
    }
  }
  return result
}
