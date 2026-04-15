import type { DailyRow } from '~/utils/d3Helpers'

export const STREAMGRAPH_TOP_CONTRIBUTORS = 30
export const OTHERS_LABEL = 'Others'

/**
 * Filters daily data to the top N contributors by total commits.
 * Remaining contributors are aggregated under a single "Others" layer.
 *
 * This dramatically reduces D3 stack computation and SVG DOM elements
 * for repositories with many one-off contributors.
 */
export function useStreamgraphData(
  rows: DailyRow[],
  topN: number = STREAMGRAPH_TOP_CONTRIBUTORS,
): { filteredRows: DailyRow[], topContributors: Set<string> } {
  // 1. Compute total commits per contributor
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.contributor, (totals.get(row.contributor) || 0) + row.commits)
  }

  // 2. Identify top N contributors
  const sorted = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name)

  const topSet = new Set<string>(sorted)

  // 3. Aggregate tail contributors into "Others" per date
  const othersMap = new Map<string, DailyRow>()
  const filtered: DailyRow[] = []

  for (const row of rows) {
    if (topSet.has(row.contributor)) {
      filtered.push(row)
    }
    else {
      const existing = othersMap.get(row.date)
      if (existing) {
        existing.commits += row.commits
        existing.linesAdded += row.linesAdded
        existing.linesDeleted += row.linesDeleted
        existing.filesTouched += row.filesTouched
        existing.cumulativeCommits = Math.max(existing.cumulativeCommits, row.cumulativeCommits)
      }
      else {
        othersMap.set(row.date, {
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

  // 4. Append aggregated "Others" rows
  const othersRows = Array.from(othersMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  return {
    filteredRows: [...filtered, ...othersRows],
    topContributors: topSet,
  }
}
