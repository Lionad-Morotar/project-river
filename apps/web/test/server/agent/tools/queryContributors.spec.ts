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
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
      { contributor: 'bob@example.com', totalCommits: 50, firstDate: '2025-02-01', lastDate: '2025-06-01' },
      { contributor: 'carol@example.com', totalCommits: 200, firstDate: '2025-01-15', lastDate: '2025-05-01' },
    ]
    mockSequence([
      { rows: aggRows }, // contributor 聚合（contributor 字段是 email）
      { rows: [
        { authorEmail: 'alice@example.com', authorName: 'Alice' },
        { authorEmail: 'bob@example.com', authorName: 'Bob' },
        { authorEmail: 'carol@example.com', authorName: 'Carol' },
      ] },
      { rows: aggRows.flatMap(r => [{ authorEmail: r.contributor, pathPrefix: 'src/core', cnt: '10' }]) }, // modules
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result.totalCount).toBe(3)
    expect(result.contributors).toHaveLength(3)
    expect(result.contributors[0]!.name).toBe('Carol')
    expect(result.contributors[1]!.name).toBe('Alice')
    expect(result.contributors[2]!.name).toBe('Bob')
    expect(result.contributors[0]!.commits).toBe(200)
    expect(result.contributors[0]!.email).toBe('carol@example.com')
  })

  it('happy path — sortBy recency：按 lastCommit DESC 排序', async () => {
    const aggRows = [
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-03-01' },
      { contributor: 'bob@example.com', totalCommits: 50, firstDate: '2025-02-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [
        { authorEmail: 'alice@example.com', authorName: 'Alice' },
        { authorEmail: 'bob@example.com', authorName: 'Bob' },
      ] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'recency', limit: 20 })
    expect(result.contributors[0]!.name).toBe('Bob')
    expect(result.contributors[1]!.name).toBe('Alice')
  })

  it('happy path — sortBy span：按活跃天数 DESC 排序', async () => {
    const aggRows = [
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' }, // 151 天
      { contributor: 'bob@example.com', totalCommits: 50, firstDate: '2025-05-01', lastDate: '2025-05-15' }, // 14 天
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [
        { authorEmail: 'alice@example.com', authorName: 'Alice' },
        { authorEmail: 'bob@example.com', authorName: 'Bob' },
      ] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'span', limit: 20 })
    expect(result.contributors[0]!.name).toBe('Alice')
    expect(result.contributors[1]!.name).toBe('Bob')
  })

  it('modules 提取：返回 top 5 前缀路径段', async () => {
    const aggRows = [
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
    ]
    const moduleRows = [
      { authorEmail: 'alice@example.com', pathPrefix: 'packages/core', cnt: '50' },
      { authorEmail: 'alice@example.com', pathPrefix: 'src/utils', cnt: '30' },
      { authorEmail: 'alice@example.com', pathPrefix: 'src/components', cnt: '20' },
      { authorEmail: 'alice@example.com', pathPrefix: 'apps/web', cnt: '15' },
      { authorEmail: 'alice@example.com', pathPrefix: 'packages/pipeline', cnt: '10' },
      { authorEmail: 'alice@example.com', pathPrefix: 'other/path', cnt: '5' }, // 超过 top 5
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorEmail: 'alice@example.com', authorName: 'Alice' }] },
      { rows: moduleRows },
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result.contributors[0]!.modules).toHaveLength(5)
    expect(result.contributors[0]!.modules).toContain('packages/core')
    expect(result.contributors[0]!.modules).not.toContain('other/path')
  })

  it('filter — activeAfter 过滤', async () => {
    const aggRows = [
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-03-01' },
      { contributor: 'bob@example.com', totalCommits: 50, firstDate: '2025-02-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorEmail: 'bob@example.com', authorName: 'Bob' }] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { filter: { activeAfter: '2025-05-01' }, sortBy: 'commits', limit: 20 })
    expect(result.totalCount).toBe(1)
    expect(result.contributors).toHaveLength(1)
    expect(result.contributors[0]!.name).toBe('Bob')
  })

  it('filter — activeBefore 过滤', async () => {
    const aggRows = [
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
      { contributor: 'bob@example.com', totalCommits: 50, firstDate: '2025-03-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorEmail: 'alice@example.com', authorName: 'Alice' }] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { filter: { activeBefore: '2025-02-01' }, sortBy: 'commits', limit: 20 })
    expect(result.totalCount).toBe(1)
    expect(result.contributors[0]!.name).toBe('Alice')
  })

  it('filter — minCommits 过滤', async () => {
    const aggRows = [
      { contributor: 'alice@example.com', totalCommits: 100, firstDate: '2025-01-01', lastDate: '2025-06-01' },
      { contributor: 'bob@example.com', totalCommits: 10, firstDate: '2025-03-01', lastDate: '2025-06-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [{ authorEmail: 'alice@example.com', authorName: 'Alice' }] },
      { rows: [] },
    ])

    const result = await queryContributors(1, { filter: { minCommits: 50 }, sortBy: 'commits', limit: 20 })
    expect(result.totalCount).toBe(1)
    expect(result.contributors[0]!.name).toBe('Alice')
  })

  it('空结果：mock DB 返回空', async () => {
    mockSequence([{ rows: [] }])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result).toEqual({ totalCount: 0, contributors: [] })
  })

  it('limit 截断：只返回 limit 条，但 totalCount 保留总数', async () => {
    const aggRows = Array.from({ length: 30 }, (_, i) => ({
      contributor: `user${i}@example.com`,
      totalCommits: 30 - i,
      firstDate: '2025-01-01',
      lastDate: '2025-06-01',
    }))
    mockSequence([
      { rows: aggRows },
      { rows: aggRows.slice(0, 10).map(r => ({ authorEmail: r.contributor, authorName: r.contributor.split('@')[0] })) },
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 10 })
    expect(result.totalCount).toBe(30)
    expect(result.contributors).toHaveLength(10)
  })

  it('email→name 映射缺失时 fallback 到 email', async () => {
    const aggRows = [
      { contributor: 'unknown@example.com', totalCommits: 5, firstDate: '2025-01-01', lastDate: '2025-01-01' },
    ]
    mockSequence([
      { rows: aggRows },
      { rows: [] }, // commits 表无匹配
      { rows: [] },
    ])

    const result = await queryContributors(1, { sortBy: 'commits', limit: 20 })
    expect(result.contributors[0]!.name).toBe('unknown@example.com')
    expect(result.contributors[0]!.email).toBe('unknown@example.com')
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
