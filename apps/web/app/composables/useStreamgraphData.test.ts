import type { DailyRow } from '~/utils/d3Helpers'
import { describe, expect, it } from 'vitest'
import { OTHERS_LABEL, useStreamgraphData } from './useStreamgraphData'

describe('useStreamgraphData', () => {
  const rows: DailyRow[] = [
    { date: '2024-01-01', contributor: 'alice@example.com', commits: 50, linesAdded: 100, linesDeleted: 10, filesTouched: 5, cumulativeCommits: 50 },
    { date: '2024-01-01', contributor: 'bob@example.com', commits: 30, linesAdded: 60, linesDeleted: 6, filesTouched: 3, cumulativeCommits: 30 },
    { date: '2024-01-01', contributor: 'carol@example.com', commits: 5, linesAdded: 10, linesDeleted: 1, filesTouched: 1, cumulativeCommits: 5 },
    { date: '2024-01-02', contributor: 'alice@example.com', commits: 10, linesAdded: 20, linesDeleted: 2, filesTouched: 1, cumulativeCommits: 60 },
    { date: '2024-01-02', contributor: 'carol@example.com', commits: 3, linesAdded: 6, linesDeleted: 0, filesTouched: 1, cumulativeCommits: 8 },
    { date: '2024-01-02', contributor: 'dave@example.com', commits: 1, linesAdded: 2, linesDeleted: 0, filesTouched: 1, cumulativeCommits: 1 },
  ]

  it('keeps top N contributors and aggregates tail into Others', () => {
    const { filteredRows, topContributors } = useStreamgraphData(rows, 2)

    expect(topContributors.size).toBe(2)
    expect(topContributors.has('alice@example.com')).toBe(true)
    expect(topContributors.has('bob@example.com')).toBe(true)

    const contributors = new Set(filteredRows.map(r => r.contributor))
    expect(contributors.has('alice@example.com')).toBe(true)
    expect(contributors.has('bob@example.com')).toBe(true)
    expect(contributors.has(OTHERS_LABEL)).toBe(true)
    expect(contributors.has('carol@example.com')).toBe(false)
    expect(contributors.has('dave@example.com')).toBe(false)
  })

  it('aggregates Others by date', () => {
    const { filteredRows } = useStreamgraphData(rows, 2)

    const othersRows = filteredRows.filter(r => r.contributor === OTHERS_LABEL)
    expect(othersRows.length).toBe(2)

    const jan1 = othersRows.find(r => r.date === '2024-01-01')
    expect(jan1).toBeDefined()
    expect(jan1!.commits).toBe(5)

    const jan2 = othersRows.find(r => r.date === '2024-01-02')
    expect(jan2).toBeDefined()
    expect(jan2!.commits).toBe(4)
  })

  it('preserves all top contributor rows unchanged', () => {
    const { filteredRows } = useStreamgraphData(rows, 2)

    const aliceRows = filteredRows.filter(r => r.contributor === 'alice@example.com')
    expect(aliceRows.length).toBe(2)
    expect(aliceRows.reduce((sum, r) => sum + r.commits, 0)).toBe(60)
  })

  it('returns empty when given empty rows', () => {
    const { filteredRows, topContributors } = useStreamgraphData([], 10)
    expect(filteredRows).toEqual([])
    expect(topContributors.size).toBe(0)
  })
})
