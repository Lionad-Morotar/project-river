import { db, pool } from '@project-river/db/client'
import { daily_stats, projects, sum_day } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createEvent } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import dailyAggregatedHandler from './daily-aggregated.get'

function createMockEvent(params: Record<string, string>, query: Record<string, string> = {}) {
  const url = `http://localhost/api/projects/${params.id}/daily-aggregated?${new URLSearchParams(query)}`
  const event = createEvent({ url })
  Object.assign(event.context, { params })
  event.node = event.node || {}
  event.node.res = event.node.res || {}
  event.node.res.setHeader = () => event.node!.res!
  return event
}

describe('daily-aggregated endpoint', () => {
  const hasDb = !!process.env.DATABASE_URL
  let projectId: number | undefined

  beforeAll(async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL is not set, skipping DB-dependent tests')
      return
    }
    const [project] = await db.insert(projects).values({ name: 'daily-aggregated-test', path: '/tmp/daily-aggregated-test' }).returning()
    projectId = project.id

    // Insert 51 contributors, each with 1 commit on 2024-01-01
    const dailyValues = Array.from({ length: 51 }, (_, i) => ({
      projectId: projectId!,
      date: '2024-01-01',
      contributor: `contributor-${String(i).padStart(2, '0')}@example.com`,
      commits: 1,
      insertions: i + 1,
      deletions: i,
      filesTouched: 1,
    }))
    await db.insert(daily_stats).values(dailyValues)

    const sumDayValues = Array.from({ length: 51 }, (_, i) => ({
      projectId: projectId!,
      date: '2024-01-01',
      contributor: `contributor-${String(i).padStart(2, '0')}@example.com`,
      cumulativeCommits: 1,
      cumulativeInsertions: i + 1,
      cumulativeDeletions: i,
    }))
    await db.insert(sum_day).values(sumDayValues)
  })

  afterAll(async () => {
    if (!hasDb)
      return
    if (projectId !== undefined) {
      await db.delete(sum_day).where(eq(sum_day.projectId, projectId))
      await db.delete(daily_stats).where(eq(daily_stats.projectId, projectId))
      await db.delete(projects).where(eq(projects.id, projectId))
    }
    await pool.end()
  })

  it('returns 400 for invalid projectId', async () => {
    await expect(dailyAggregatedHandler(createMockEvent({ id: 'abc' }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects malformed start date', async () => {
    await expect(dailyAggregatedHandler(createMockEvent({ id: '1' }, { start: '2024-1-1' }))).rejects.toMatchObject({ statusCode: 400 })
  })

  const testOrSkip = hasDb ? it : it.skip

  testOrSkip('returns 404 for nonexistent project', async () => {
    await expect(dailyAggregatedHandler(createMockEvent({ id: '999999' }))).rejects.toMatchObject({ statusCode: 404 })
  })

  testOrSkip('returns all 51 contributors as individuals (Top 99 + Others, 51 < 99)', async () => {
    if (!hasDb)
      return
    const result = await dailyAggregatedHandler(createMockEvent({ id: String(projectId) }))
    expect(Array.isArray(result)).toBe(true)

    const jan1Rows = result.filter((r: any) => r.date === '2024-01-01')
    // 51 contributors < LIMIT 99, so no Others aggregation — all returned individually
    expect(jan1Rows.length).toBe(51)

    const contributors = jan1Rows.map((r: any) => r.contributor)
    expect(contributors).not.toContain('Other contributors')
  })

  testOrSkip('Tail contributors remain as individuals when total < LIMIT', async () => {
    if (!hasDb)
      return
    const result = await dailyAggregatedHandler(createMockEvent({ id: String(projectId) }))
    // With LIMIT 99 and only 51 contributors, no "Other contributors" row exists
    const othersRow = result.find((r: any) => r.date === '2024-01-01' && r.contributor === 'Other contributors')
    expect(othersRow).toBeUndefined()

    // The last 2 contributors (indices 49, 50) are returned as individuals
    const jan1Rows = result.filter((r: any) => r.date === '2024-01-01')
    expect(jan1Rows.length).toBe(51)
  })

  testOrSkip('response fields match DailyStatsRow shape', async () => {
    if (!hasDb)
      return
    const result = await dailyAggregatedHandler(createMockEvent({ id: String(projectId) }))
    expect(result.length).toBeGreaterThan(0)
    const row = result[0]
    expect(row).toHaveProperty('date')
    expect(row).toHaveProperty('contributor')
    expect(row).toHaveProperty('commits')
    expect(row).toHaveProperty('linesAdded')
    expect(row).toHaveProperty('linesDeleted')
    expect(row).toHaveProperty('filesTouched')
    expect(row).toHaveProperty('cumulativeCommits')
    expect(typeof row.date).toBe('string')
    expect(typeof row.contributor).toBe('string')
    expect(typeof row.commits).toBe('number')
    expect(typeof row.linesAdded).toBe('number')
    expect(typeof row.linesDeleted).toBe('number')
    expect(typeof row.filesTouched).toBe('number')
    expect(typeof row.cumulativeCommits).toBe('number')
  })
})
