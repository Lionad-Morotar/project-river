import type { DailyRow } from '~/utils/d3Helpers'
import { describe, expect, it } from 'vitest'
import { useStreamgraphData } from './useStreamgraphData'

describe('useStreamgraphData', () => {
  const rows: DailyRow[] = [
    { date: '2024-01-01', contributor: 'alice@example.com', commits: 50, linesAdded: 100, linesDeleted: 10, filesTouched: 5, cumulativeCommits: 50 },
    { date: '2024-01-01', contributor: 'bob@example.com', commits: 30, linesAdded: 60, linesDeleted: 6, filesTouched: 3, cumulativeCommits: 30 },
    { date: '2024-01-02', contributor: 'alice@example.com', commits: 10, linesAdded: 20, linesDeleted: 2, filesTouched: 1, cumulativeCommits: 60 },
    { date: '2024-01-02', contributor: 'carol@example.com', commits: 3, linesAdded: 6, linesDeleted: 0, filesTouched: 1, cumulativeCommits: 8 },
  ]

  it('returns all rows as filteredRows (passthrough)', () => {
    const { filteredRows } = useStreamgraphData(rows)
    expect(filteredRows).toBe(rows)
    expect(filteredRows.length).toBe(4)
  })

  it('includes all contributors in topContributors', () => {
    const { topContributors } = useStreamgraphData(rows)
    expect(topContributors.size).toBe(3)
    expect(topContributors.has('alice@example.com')).toBe(true)
    expect(topContributors.has('bob@example.com')).toBe(true)
    expect(topContributors.has('carol@example.com')).toBe(true)
  })

  it('returns empty when given empty rows', () => {
    const { filteredRows, topContributors } = useStreamgraphData([])
    expect(filteredRows).toEqual([])
    expect(topContributors.size).toBe(0)
  })
})
