import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock DB 和 projectStats ──
const mockExecute = vi.fn()

vi.doMock('@project-river/db/client', () => ({
  db: { execute: mockExecute },
}))

vi.doMock('~/server/utils/projectStats', () => ({
  assertProjectExists: vi.fn().mockResolvedValue(undefined),
  buildDailyDateBounds: vi.fn(),
}))

// 动态 import 被测模块（必须在 doMock 之后）
const { queryContributors, queryContributorsSchema } = await import('~/server/agent/tools/queryContributors')

describe('queryContributors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** 简化 mock：按调用顺序返回不同结果 */
  function mockSequence(results: Array<{ rows: any[] }>) {
    let callIdx = 0
    mockExecute.mockImplementation(() => {
      const result = results[callIdx] ?? { rows: [] }
      callIdx++
      return Promise.resolve(result)
    })
  }

  it('happy path — sortBy commits：按 totalCommits DESC 排序', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
      { contributor: 'bob', totalCommits: 50, firstDate: '2025-02-01', lastDate: '2025-06-01' },
      { contributor: 'carol', totalCommits: 200, firstDate: '2025-01-15', lastDate: '2025-05-01' },
    ]
    mockSequence([
      { rows: aggRows }, // contributor 聚合
      { rows: aggRows.map(r => ({ authorName: r.contributor, authorEmail: `${r.contributor}@test.com` })) }, // email
      { rows: aggRows.flatMap(r => [{ authorName: r.contributor, pathPrefix: 'src/core', cnt: '10' }]) }, // modules
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result).toHaveLength(3)
    expect(result[0]!.name).toBe('carol')
    expect(result[1]!.name).toBe('alice')
    expect(result[2]!.name).toBe('bob')
    expect(result[0]!.commits).toBe(200)
  })

  it('happy path — sortBy recency：按 lastCommit DESC 排序', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-03-01' },
      { contributor: 'bob', totalCommits: 50, firstDate: '2025-02-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: aggRows.map(r => ({ authorName: r.contributor, authorEmail: `${r.contributor}@test.com` })) },
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'recency', limit: 20 })
    expect(result[0]!.name).toBe('bob')
    expect(result[1]!.name).toBe('alice')
  })

  it('happy path — sortBy span：按活跃天数 DESC 排序', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' }, // 151 天
      { contributor: 'bob', totalCommits: 50, firstDate: '2025-05-01', lastDate: '2025-05-15' }, // 14 天
    ]
    mockSequence([
      { rows: aggRows },
      { rows: aggRows.map(r => ({ authorName: r.contributor, authorEmail: `${r.contributor}@test.com` })) },
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'span', limit: 20 })
    expect(result[0]!.name).toBe('alice')
    expect(result[1]!.name).toBe('bob')
  })

  it('modules 提取：返回 top 5 前缀路径段', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
    ]
    const moduleRows = [
      { authorName: 'alice', pathPrefix: 'packages/core', cnt: '50' },
      { authorName: 'alice', pathPrefix: 'src/utils', cnt: '30' },
      { authorName: 'alice', pathPrefix: 'src/components', cnt: '20' },
      { authorName: 'alice', pathPrefix: 'apps/web', cnt: '15' },
      { authorName: 'alice', pathPrefix: 'packages/pipeline', cnt: '10' },
      { authorName: 'alice', pathPrefix: 'other/path', cnt: '5' }, // 超过 top 5
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorName: 'alice', authorEmail: 'alice@test.com' }] },
      { rows: moduleRows },
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result[0]!.modules).toHaveLength(5)
    expect(result[0]!.modules).toContain('packages/core')
    expect(result[0]!.modules).not.toContain('other/path')
  })

  it('filter — activeAfter 过滤', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-03-01' },
      { contributor: 'bob', totalCommits: 50, firstDate: '2025-02-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorName: 'bob', authorEmail: 'bob@test.com' }] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { filter: { activeAfter: '2025-05-01' }, sortBy: 'commits', limit: 20 })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('bob')
  })

  it('filter — activeBefore 过滤', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
      { contributor: 'bob', totalCommits: 50, firstDate: '2025-03-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorName: 'alice', authorEmail: 'alice@test.com' }] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { filter: { activeBefore: '2025-02-01' }, sortBy: 'commits', limit: 20 })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('alice')
  })

  it('filter — minCommits 过滤', async () => {
    const aggRows = [
      { contributor: 'alice', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
      { contributor: 'bob', totalCommits: 10, firstDate: '2025-03-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorName: 'alice', authorEmail: 'alice@test.com' }] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { filter: { minCommits: 50 }, sortBy: 'commits', limit: 20 })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('alice')
  })

  it('空结果：mock DB 返回空', async () => {
    mockSequence([{ rows: [] }])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result).toEqual([])
  })

  it('limit 截断：只返回 limit 条', async () => {
    const aggRows = Array.from({ length: 30 }, (_, i) => ({
      contributor: `user${i}`,
      totalCommits: 30 - i,
      firstDate: '2025-01-01',
      lastDate: '2025-06-01',
    }))
    mockSequence([
      { rows: aggRows },
      { rows: aggRows.slice(0, 10).map(r => ({ authorName: r.contributor, authorEmail: `${r.contributor}@test.com` })) },
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 10 })
    expect(result).toHaveLength(10)
  })

  it('zod schema 校验：limit > 50 被 reject', () => {
    const result = queryContributorsSchema.safeParse({ sortBy: 'commits', limit: 100 })
    expect(result.success).toBe(false)
  })

  it('zod schema 校验：sortBy 非法值被 reject', () => {
    const result = queryContributorsSchema.safeParse({ sortBy: 'invalid', limit: 10 })
    expect(result.success).toBe(false)
  })
})
