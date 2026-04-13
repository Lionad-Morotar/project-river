import { db } from '@project-river/db/client'
import { daily_stats, projects, sum_day } from '@project-river/db/schema'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { generateSumDay } from '../src/db/sumDay.ts'

describe('sumDay', () => {
  const hasDb = !!process.env.DATABASE_URL
  let projectId: number

  beforeAll(async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL is not set, skipping sumDay integration tests')
      return
    }
    const [project] = await db.insert(projects).values({ name: 'sumDay-test', path: '/tmp/sumday-test' }).returning()
    projectId = project.id
  })

  afterEach(async () => {
    if (!hasDb)
      return
    await db.delete(sum_day).where(eq(sum_day.projectId, projectId))
    await db.delete(daily_stats).where(eq(daily_stats.projectId, projectId))
  })

  afterAll(async () => {
    if (!hasDb)
      return
    await db.delete(projects).where(eq(projects.id, projectId))
  })

  it.skipIf(!hasDb)('single contributor cumulative stats', async () => {
    await db.insert(daily_stats).values([
      { projectId, date: '2024-01-01', contributor: 'alice@example.com', commits: 2, insertions: 10, deletions: 5, filesTouched: 1 },
      { projectId, date: '2024-01-02', contributor: 'alice@example.com', commits: 3, insertions: 20, deletions: 10, filesTouched: 2 },
    ])

    await generateSumDay(projectId)

    const rows = await db.select().from(sum_day).where(eq(sum_day.projectId, projectId)).orderBy(sum_day.date)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      contributor: 'alice@example.com',
      date: '2024-01-01',
      cumulativeCommits: 2,
      cumulativeInsertions: 10,
      cumulativeDeletions: 5,
    })
    expect(rows[1]).toMatchObject({
      contributor: 'alice@example.com',
      date: '2024-01-02',
      cumulativeCommits: 5,
      cumulativeInsertions: 30,
      cumulativeDeletions: 15,
    })
  })

  it.skipIf(!hasDb)('multi-contributor isolation', async () => {
    await db.insert(daily_stats).values([
      { projectId, date: '2024-01-01', contributor: 'alice@example.com', commits: 2, insertions: 10, deletions: 5, filesTouched: 1 },
      { projectId, date: '2024-01-02', contributor: 'alice@example.com', commits: 3, insertions: 20, deletions: 10, filesTouched: 2 },
      { projectId, date: '2024-01-01', contributor: 'bob@example.com', commits: 1, insertions: 5, deletions: 2, filesTouched: 1 },
      { projectId, date: '2024-01-02', contributor: 'bob@example.com', commits: 2, insertions: 8, deletions: 4, filesTouched: 1 },
    ])

    await generateSumDay(projectId)

    const aliceRows = await db.select().from(sum_day).where(and(eq(sum_day.projectId, projectId), eq(sum_day.contributor, 'alice@example.com'))).orderBy(sum_day.date)
    expect(aliceRows).toHaveLength(2)
    expect(aliceRows[0].cumulativeCommits).toBe(2)
    expect(aliceRows[1].cumulativeCommits).toBe(5)

    const bobRows = await db.select().from(sum_day).where(and(eq(sum_day.projectId, projectId), eq(sum_day.contributor, 'bob@example.com'))).orderBy(sum_day.date)
    expect(bobRows).toHaveLength(2)
    expect(bobRows[0].cumulativeCommits).toBe(1)
    expect(bobRows[1].cumulativeCommits).toBe(3)
  })
})
