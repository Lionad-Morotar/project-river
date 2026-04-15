import { db, pool } from '@project-river/db/client'
import { daily_stats, projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createEvent } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import monthlyHandler from './monthly.get'

async function invokeMonthlyHandler(routerParams: Record<string, string>, query: Record<string, string> = {}) {
  const event = createEvent({
    url: `http://localhost/api/projects/${routerParams.id}/monthly?${new URLSearchParams(query)}`,
  })
  Object.assign(event.context, { params: routerParams })
  event.node = event.node || {}
  event.node.res = event.node.res || {}
  event.node.res.setHeader = () => event.node!.res!
  return monthlyHandler(event)
}

describe('monthly endpoint', () => {
  const hasDb = !!process.env.DATABASE_URL
  let projectId: number | undefined

  beforeAll(async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL is not set, skipping DB-dependent tests')
      return
    }
    const [project] = await db.insert(projects).values({ name: 'monthly-test', path: '/tmp/monthly-test' }).returning()
    projectId = project.id

    await db.insert(daily_stats).values([
      { projectId, date: '2024-01-15', contributor: 'bob@example.com', commits: 3, insertions: 20, deletions: 10, filesTouched: 2 },
      { projectId, date: '2024-02-10', contributor: 'bob@example.com', commits: 1, insertions: 5, deletions: 2, filesTouched: 1 },
    ])
  })

  afterAll(async () => {
    if (!hasDb)
      return
    if (projectId !== undefined) {
      await db.delete(daily_stats).where(eq(daily_stats.projectId, projectId))
      await db.delete(projects).where(eq(projects.id, projectId))
    }
    await pool.end()
  })

  it('returns 400 for invalid projectId', async () => {
    await expect(invokeMonthlyHandler({ id: 'not-a-number' })).rejects.toMatchObject({ statusCode: 400 })
  })

  const testOrSkip = hasDb ? it : it.skip
  testOrSkip('returns 404 for missing project', async () => {
    await expect(invokeMonthlyHandler({ id: '999999' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns monthly aggregated rows', async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL missing, skipping integration test')
      return
    }
    const result = await invokeMonthlyHandler({ id: String(projectId) })
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    const row = result.find((r: any) => r.yearMonth === '2024-01' && r.contributor === 'bob@example.com')
    expect(row).toBeDefined()
    expect(row).toMatchObject({
      yearMonth: '2024-01',
      contributor: 'bob@example.com',
      commits: 3,
      linesAdded: 20,
      linesDeleted: 10,
      filesTouched: 2,
    })
  })

  testOrSkip('rejects limit above 100000', async () => {
    await expect(invokeMonthlyHandler({ id: String(projectId) }, { limit: '100001' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
