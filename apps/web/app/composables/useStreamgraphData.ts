import type { DailyRow } from '~/utils/d3Helpers'

export const STREAMGRAPH_TOP_CONTRIBUTORS = 30
export const OTHERS_LABEL = 'Others'

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
