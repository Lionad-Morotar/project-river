import type { DailyRow } from '../../app/utils/d3Helpers'
import { describe, expect, it } from 'vitest'
import { getMonthContributors, getMonthCumulative } from '../../app/utils/monthDetailHelpers'

interface MonthlyRow {
  yearMonth: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
}

describe('getMonthCumulative', () => {
  it('returns 0 when no rows match the contributor/month', () => {
    const rows: DailyRow[] = [
      { date: '2024-01-01', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 5 },
    ]
    expect(getMonthCumulative(rows, '2024-02', 'alice')).toBe(0)
    expect(getMonthCumulative(rows, '2024-01', 'bob')).toBe(0)
  })

  it('returns the cumulativeCommits of the latest day in the month for that contributor', () => {
    const rows: DailyRow[] = [
      { date: '2024-01-05', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 3 },
      { date: '2024-01-10', contributor: 'alice', commits: 2, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 5 },
      { date: '2024-01-02', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 2 },
    ]
    expect(getMonthCumulative(rows, '2024-01', 'alice')).toBe(5)
  })
})

describe('getMonthContributors', () => {
  it('returns all contributors sorted by monthlyCommits descending, with stable color mapping and cumulative values', () => {
    const monthly: MonthlyRow[] = [
      { yearMonth: '2024-01', contributor: 'alice', commits: 5, linesAdded: 0, linesDeleted: 0, filesTouched: 0 },
      { yearMonth: '2024-01', contributor: 'bob', commits: 10, linesAdded: 0, linesDeleted: 0, filesTouched: 0 },
      { yearMonth: '2024-02', contributor: 'alice', commits: 3, linesAdded: 0, linesDeleted: 0, filesTouched: 0 },
    ]
    const daily: DailyRow[] = [
      { date: '2024-01-05', contributor: 'alice', commits: 2, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 7 },
      { date: '2024-01-10', contributor: 'bob', commits: 5, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 12 },
      { date: '2024-01-03', contributor: 'alice', commits: 3, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 5 },
    ]
    const colorMap = new Map<string, string>([
      ['alice', '#ff0000'],
      ['bob', '#00ff00'],
    ])

    const result = getMonthContributors(monthly, daily, '2024-01', colorMap)
    expect(result).toHaveLength(2)
    expect(result[0].contributor).toBe('bob')
    expect(result[0].monthlyCommits).toBe(10)
    expect(result[0].cumulativeCommits).toBe(12)
    expect(result[0].color).toBe('#00ff00')

    expect(result[1].contributor).toBe('alice')
    expect(result[1].monthlyCommits).toBe(5)
    expect(result[1].cumulativeCommits).toBe(7)
    expect(result[1].color).toBe('#ff0000')
  })

  it('falls back to #999 when contributor is missing from colorMap', () => {
    const monthly: MonthlyRow[] = [
      { yearMonth: '2024-01', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0 },
    ]
    const daily: DailyRow[] = [
      { date: '2024-01-01', contributor: 'alice', commits: 1, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 1 },
    ]
    const result = getMonthContributors(monthly, daily, '2024-01', new Map())
    expect(result[0].color).toBe('#999')
  })

  it('sorts by contributor ascending when monthlyCommits are equal', () => {
    const monthly: MonthlyRow[] = [
      { yearMonth: '2024-01', contributor: 'bob', commits: 5, linesAdded: 0, linesDeleted: 0, filesTouched: 0 },
      { yearMonth: '2024-01', contributor: 'alice', commits: 5, linesAdded: 0, linesDeleted: 0, filesTouched: 0 },
    ]
    const daily: DailyRow[] = [
      { date: '2024-01-01', contributor: 'alice', commits: 5, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 5 },
      { date: '2024-01-01', contributor: 'bob', commits: 5, linesAdded: 0, linesDeleted: 0, filesTouched: 0, cumulativeCommits: 5 },
    ]
    const result = getMonthContributors(monthly, daily, '2024-01', new Map())
    expect(result[0].contributor).toBe('alice')
    expect(result[1].contributor).toBe('bob')
  })
})
