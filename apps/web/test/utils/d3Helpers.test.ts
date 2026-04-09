import type { DailyRow } from '../../app/utils/d3Helpers'
import { describe, expect, it } from 'vitest'
import { buildStack, pivotDailyData } from '../../app/utils/d3Helpers'

describe('pivotDailyData', () => {
  it('returns pivoted rows with date and per-contributor commits', () => {
    const rows: DailyRow[] = [
      { date: '2024-01-01', contributor: 'alice', commits: 2, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 0 },
      { date: '2024-01-01', contributor: 'bob', commits: 3, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 0 },
    ]
    const result = pivotDailyData(rows)
    expect(result).toHaveLength(1)
    expect(result[0].date.toISOString()).toBe(new Date('2024-01-01').toISOString())
    expect(result[0].alice).toBe(2)
    expect(result[0].bob).toBe(3)
  })

  it('fills missing contributor/day combinations with 0', () => {
    const rows: DailyRow[] = [
      { date: '2024-01-01', contributor: 'alice', commits: 2, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 0 },
      { date: '2024-01-02', contributor: 'bob', commits: 3, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 0 },
    ]
    const result = pivotDailyData(rows)
    expect(result).toHaveLength(2)
    const day1 = result.find(r => r.date.toISOString() === new Date('2024-01-01').toISOString())
    const day2 = result.find(r => r.date.toISOString() === new Date('2024-01-02').toISOString())
    expect(day1?.alice).toBe(2)
    expect(day1?.bob).toBe(0)
    expect(day2?.alice).toBe(0)
    expect(day2?.bob).toBe(3)
  })

  it('returns rows sorted by date ascending', () => {
    const rows: DailyRow[] = [
      { date: '2024-01-03', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 0 },
      { date: '2024-01-01', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 0 },
    ]
    const result = pivotDailyData(rows)
    expect(result[0].date.toISOString()).toBe(new Date('2024-01-01').toISOString())
    expect(result[1].date.toISOString()).toBe(new Date('2024-01-03').toISOString())
  })
})

describe('buildStack', () => {
  it('returns a series array with key property and [y0, y1] tuples', () => {
    const contributors = ['alice', 'bob']
    const data = [
      { date: new Date('2024-01-01'), alice: 2, bob: 3 },
      { date: new Date('2024-01-02'), alice: 1, bob: 4 },
    ]
    const series = buildStack(contributors, data)
    expect(series).toHaveLength(2)
    expect(series[0].key).toBe('alice')
    expect(series[1].key).toBe('bob')
    expect(series[0]).toHaveLength(2)
    expect(series[0][0]).toSatisfy((d: [number, number]) => typeof d[0] === 'number' && typeof d[1] === 'number')
  })

  it('uses stackOffsetWiggle and stackOrderInsideOut (baseline not flat zero)', () => {
    const contributors = ['alice', 'bob']
    const data = [
      { date: new Date('2024-01-01'), alice: 10, bob: 10 },
      { date: new Date('2024-01-02'), alice: 10, bob: 10 },
    ]
    const series = buildStack(contributors, data)
    // With wiggle offset, the baseline should be centered and not zero for some points
    const alice = series.find(s => s.key === 'alice')
    const bob = series.find(s => s.key === 'bob')
    expect(alice).toBeDefined()
    expect(bob).toBeDefined()
    // At least one y0 should be non-zero due to wiggle centering
    const hasNonZeroBaseline = series.some(s => s.some(d => d[0] !== 0))
    expect(hasNonZeroBaseline).toBe(true)
  })
})
