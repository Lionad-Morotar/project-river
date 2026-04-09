import type { DailyStat } from '../src/calcDay.ts'
import type { ParsedCommit } from '../src/types.ts'
import { describe, expect, it } from 'vitest'
import { calcDay } from '../src/calcDay.ts'

function makeCommit(
  authorEmail: string,
  committerDate: Date,
  files: ParsedCommit['files'],
): ParsedCommit {
  return {
    hash: '0000000',
    authorName: 'Test',
    authorEmail,
    committerDate,
    message: 'test',
    files,
  }
}

describe('calcDay', () => {
  it('basic aggregation: same contributor, same day, overlapping files', () => {
    const commits: ParsedCommit[] = [
      makeCommit('alice@example.com', new Date('2026-04-01T10:00:00Z'), [
        { path: 'src/a.ts', insertions: 10, deletions: 2 },
        { path: 'src/b.ts', insertions: 5, deletions: 1 },
      ]),
      makeCommit('alice@example.com', new Date('2026-04-01T14:00:00Z'), [
        { path: 'src/a.ts', insertions: 3, deletions: 0 },
      ]),
    ]

    const result = calcDay(commits)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      date: '2026-04-01',
      contributor: 'alice@example.com',
      commits: 2,
      insertions: 18,
      deletions: 3,
      filesTouched: 2,
    } satisfies DailyStat)
  })

  it('uTC day boundary: negative timezone offset pushes date to next UTC day', () => {
    const commits: ParsedCommit[] = [
      makeCommit('alice@example.com', new Date('2024-01-02T23:00:00-05:00'), [
        { path: 'x', insertions: 1, deletions: 0 },
      ]),
    ]

    const result = calcDay(commits)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2024-01-03')
  })

  it('multi-contributor multi-day separation yields 4 records', () => {
    const commits: ParsedCommit[] = [
      makeCommit('alice@example.com', new Date('2026-04-01T10:00:00Z'), [
        { path: 'a.ts', insertions: 1, deletions: 0 },
      ]),
      makeCommit('alice@example.com', new Date('2026-04-02T10:00:00Z'), [
        { path: 'b.ts', insertions: 1, deletions: 0 },
      ]),
      makeCommit('bob@example.com', new Date('2026-04-01T10:00:00Z'), [
        { path: 'c.ts', insertions: 1, deletions: 0 },
      ]),
      makeCommit('bob@example.com', new Date('2026-04-02T10:00:00Z'), [
        { path: 'd.ts', insertions: 1, deletions: 0 },
      ]),
    ]

    const result = calcDay(commits)
    expect(result).toHaveLength(4)

    const keys = result.map(r => `${r.date}::${r.contributor}`)
    expect(keys).toEqual([
      '2026-04-01::alice@example.com',
      '2026-04-01::bob@example.com',
      '2026-04-02::alice@example.com',
      '2026-04-02::bob@example.com',
    ])
  })

  it('empty commit yields zero insertions, deletions, and filesTouched', () => {
    const commits: ParsedCommit[] = [
      makeCommit('dev@example.com', new Date('2026-04-01T10:00:00Z'), []),
    ]

    const result = calcDay(commits)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      date: '2026-04-01',
      contributor: 'dev@example.com',
      commits: 1,
      insertions: 0,
      deletions: 0,
      filesTouched: 0,
    } satisfies DailyStat)
  })
})
