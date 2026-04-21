import type { DailyRow } from '~/utils/d3Helpers'

export const OTHERS_LABEL = 'Other contributors'

/**
 * Passthrough for daily rows now that the backend handles Top-49 + Others aggregation.
 *
 * Keeps the same return shape for backward compatibility with Streamgraph.vue
 * and d3Helpers.ts.
 */
export function useStreamgraphData(
  rows: DailyRow[],
): { filteredRows: DailyRow[], topContributors: Set<string> } {
  const topContributors = new Set<string>()
  for (const row of rows) {
    topContributors.add(row.contributor)
  }
  return {
    filteredRows: rows,
    topContributors,
  }
}

/**
 * Aggregate bottom contributors into "Other contributors" keeping only the top N.
 * Rows already labeled `OTHERS_LABEL` are always merged into the new Others bucket.
 */
export function applyTopN(rows: DailyRow[], n: number): DailyRow[] {
  if (n <= 0)
    return rows

  // Count total commits per contributor (excluding existing Others)
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.contributor !== OTHERS_LABEL)
      totals.set(row.contributor, (totals.get(row.contributor) || 0) + row.commits)
  }

  // If n covers all contributors, no aggregation needed
  if (n >= totals.size)
    return rows

  // Determine top N set
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const topSet = new Set(sorted.slice(0, n).map(([name]) => name))

  const result: DailyRow[] = []
  const othersByDate = new Map<string, DailyRow>()

  for (const row of rows) {
    if (topSet.has(row.contributor)) {
      result.push(row)
    }
    else {
      const key = row.date
      const existing = othersByDate.get(key)
      if (existing) {
        existing.commits += row.commits
        existing.linesAdded += row.linesAdded
        existing.linesDeleted += row.linesDeleted
        existing.filesTouched += row.filesTouched
        existing.cumulativeCommits += row.cumulativeCommits
      }
      else {
        othersByDate.set(key, {
          date: row.date,
          contributor: OTHERS_LABEL,
          commits: row.commits,
          linesAdded: row.linesAdded,
          linesDeleted: row.linesDeleted,
          filesTouched: row.filesTouched,
          cumulativeCommits: row.cumulativeCommits,
        })
      }
    }
  }

  for (const row of othersByDate.values())
    result.push(row)

  return result
}
