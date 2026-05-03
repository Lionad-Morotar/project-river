import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock DB 和 projectStats ──
const mockExecute = vi.fn()

vi.doMock('@project-river/db/client', () => ({
  db: { execute: mockExecute },
}))

const mockBuildDailyDateBounds = vi.fn()

vi.doMock('~/server/utils/projectStats', () => ({
  assertProjectExists: vi.fn().mockResolvedValue(undefined),
  buildDailyDateBounds: mockBuildDailyDateBounds,
}))

// 动态 import
const { queryProjectEvents, queryProjectEventsSchema } = await import('~/server/agent/tools/queryProjectEvents')

/** 构造足以触发 project_start + contributor_first_commit + commit_milestone 的 DailyRow fixture */
function makeDailyRows(): Array<{
  date: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  cumulativeCommits: number
}> {
  const rows = []
  for (let i = 0; i < 25; i++) {
    const d = new Date('2025-01-01')
    d.setDate(d.getDate() + i)
    rows.push({
      date: d.toISOString().split('T')[0]!,
      contributor: 'alice',
      commits: 10,
      linesAdded: 100,
      linesDeleted: 20,
      filesTouched: 3,
      cumulativeCommits: (i + 1) * 10,
    })
  }
  return rows
}

describe('queryProjectEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildDailyDateBounds.mockReturnValue({
      startDate: { getSQL: () => '2025-01-01' },
      endDate: { getSQL: () => '2025-01-31' },
    })
  })

  it('happy path — 返回检测到的事件列表', async () => {
    const dailyRows = makeDailyRows()
    mockExecute.mockResolvedValue({ rows: dailyRows })

    const events = await queryProjectEvents(1, {})
    expect(events.length).toBeGreaterThan(0)
    // 应包含 project_start（最早日期）
    expect(events.some(e => e.type === 'project_start')).toBe(true)
    // alice 有 250 commits，应触发 contributor_first_commit
    expect(events.some(e => e.type === 'contributor_first_commit')).toBe(true)
    // 250 commits 应触发 commit_milestone:100
    expect(events.some(e => e.type === 'commit_milestone' && e.params.threshold === 100)).toBe(true)
  })

  it('typeFilter 过滤：只返回指定类型事件', async () => {
    const dailyRows = makeDailyRows()
    mockExecute.mockResolvedValue({ rows: dailyRows })

    const events = await queryProjectEvents(1, {
      typeFilter: ['activity_spike'],
    })
    for (const e of events) {
      expect(e.type).toBe('activity_spike')
    }
    // activity_spike 在均匀数据中不太可能触发
    // 这个测试验证过滤逻辑正确即可
  })

  it('typeFilter 过滤：多个类型', async () => {
    const dailyRows = makeDailyRows()
    mockExecute.mockResolvedValue({ rows: dailyRows })

    const events = await queryProjectEvents(1, {
      typeFilter: ['project_start', 'commit_milestone'],
    })
    for (const e of events) {
      expect(['project_start', 'commit_milestone']).toContain(e.type)
    }
    expect(events.length).toBeGreaterThan(0)
  })

  it('dateRange 过滤：只返回日期范围内事件', async () => {
    const dailyRows = makeDailyRows()
    mockExecute.mockResolvedValue({ rows: dailyRows })

    const events = await queryProjectEvents(1, {
      dateRange: { start: '2025-01-20', end: '2025-01-25' },
    })
    for (const e of events) {
      expect(e.date >= '2025-01-20').toBe(true)
      expect(e.date <= '2025-01-25').toBe(true)
    }
  })

  it('空结果：mock DB 返回空 dailyData', async () => {
    mockExecute.mockResolvedValue({ rows: [] })

    const events = await queryProjectEvents(1, {})
    expect(events).toEqual([])
  })

  it('zod schema 校验：typeFilter 中非法 EventType 被 reject', () => {
    const result = queryProjectEventsSchema.safeParse({
      typeFilter: ['invalid_type'],
    })
    expect(result.success).toBe(false)
  })

  it('zod schema 校验：合法参数 pass', () => {
    const result = queryProjectEventsSchema.safeParse({
      typeFilter: ['activity_spike', 'project_start'],
      dateRange: { start: '2025-01-01', end: '2025-06-01' },
    })
    expect(result.success).toBe(true)
  })
})
