import { db, pool } from '@project-river/db/client'
import { daily_stats, projects, sum_day } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createEvent } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import dailyHandler from './daily.get'

function createMockEvent(params: Record<string, string>, query: Record<string, string> = {}) {
  const url = `http://localhost/api/projects/${params.id}/daily?${new URLSearchParams(query)}`
  const event = createEvent({ url })
  Object.assign(event.context, { params })
  event.node = event.node || {}
  event.node.res = event.node.res || {}
  event.node.res.setHeader = () => event.node!.res!
  return event
}

describe('daily endpoint', () => {
  const hasDb = !!process.env.DATABASE_URL
  let projectId: number | undefined

  beforeAll(async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL is not set, skipping DB-dependent tests')
      return
    }
    const [project] = await db.insert(projects).values({ name: 'daily-test', path: '/tmp/daily-test' }).returning()
    projectId = project.id

    await db.insert(daily_stats).values([
      { projectId, date: '2024-01-01', contributor: 'alice@example.com', commits: 2, insertions: 10, deletions: 5, filesTouched: 1 },
    ])
    await db.insert(sum_day).values([
      { projectId, date: '2024-01-01', contributor: 'alice@example.com', cumulativeCommits: 2, cumulativeInsertions: 10, cumulativeDeletions: 5 },
    ])
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
    await expect(dailyHandler(createMockEvent({ id: 'abc' }))).rejects.toMatchObject({ statusCode: 400 })
  })

  const testOrSkip = hasDb ? it : it.skip
  testOrSkip('returns 404 for nonexistent project', async () => {
    await expect(dailyHandler(createMockEvent({ id: '999999' }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns daily rows with cumulativeCommits', async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL missing, skipping integration test')
      return
    }
    const result = await dailyHandler(createMockEvent({ id: String(projectId) }))
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    const row = result.find((r: any) => r.date === '2024-01-01' && r.contributor === 'alice@example.com')
    expect(row).toBeDefined()
    expect(row).toMatchObject({
      date: '2024-01-01',
      contributor: 'alice@example.com',
      commits: 2,
      linesAdded: 10,
      linesDeleted: 5,
      filesTouched: 1,
      cumulativeCommits: 2,
    })
  })

  it('rejects malformed start date', async () => {
    await expect(dailyHandler(createMockEvent({ id: '1' }, { start: '2024-1-1' }))).rejects.toMatchObject({ statusCode: 400 })
  })
})
