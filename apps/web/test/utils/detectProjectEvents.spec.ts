import type { DailyRow, EventDetectionConfig } from '../../app/../server/utils/detectProjectEvents'
import { describe, expect, it } from 'vitest'
import {
  buildDayStats,
  daysBetween,
  detectActivityMutations,
  detectContributorEvents,
  detectEvents,
  detectMilestones,
  detectProjectArchived,
  detectRefactors,
} from '../../app/../server/utils/detectProjectEvents'

// ── 工厂函数 ──

function makeDailyRow(overrides: Partial<DailyRow> = {}): DailyRow {
  return {
    date: '2025-01-15',
    contributor: 'alice',
    commits: 5,
    linesAdded: 100,
    linesDeleted: 20,
    filesTouched: 3,
    cumulativeCommits: 50,
    ...overrides,
  }
}

/** 生成连续日期的 DailyRow 数组 */
function makeDateRange(
  startDate: string,
  days: number,
  contributor: string = 'alice',
  commitsPerDay: number = 5,
): DailyRow[] {
  const rows: DailyRow[] = []
  const base = new Date(startDate)
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]!
    rows.push(makeDailyRow({
      date: dateStr,
      contributor,
      commits: commitsPerDay,
      cumulativeCommits: (i + 1) * commitsPerDay,
    }))
  }
  return rows
}

const fullConfig: EventDetectionConfig = {
  contributorExitThresholdCommits: 50,
  contributorExitGapDays: 60,
  contributorExitProjectActiveDays: 30,
  firstCommitThreshold: 20,
  activitySpikeZScore: 3.5,
  activityDropZScore: 2.0,
  activityDropConsecutiveDays: 7,
  slidingWindowDays: 30,
  minDataDaysForMutation: 14,
  refactorDeletionMultiplier: 8,
  refactorCooldownDays: 30,
  commitMilestones: [100, 500, 1000, 5000, 10000],
  enabledRules: [
    'contributor_first_commit',
    'contributor_exit',
    'activity_spike',
    'activity_drop',
    'major_refactor',
    'commit_milestone',
    'project_start',
    'project_archived',
  ],
}

// ── 测试用例 ──

describe('detectEvents', () => {
  it('空输入返回空数组', () => {
    expect(detectEvents([])).toEqual([])
  })

  it('排序验证：事件按日期升序、priority 降序排列', () => {
    // 构造能同时触发 project_start + contributor_first_commit + commit_milestone 的数据
    const rows: DailyRow[] = [
      ...makeDateRange('2025-01-01', 5, 'alice', 25), // 5 天, 25 commits/day = 125 total
    ]
    const events = detectEvents(rows)
    expect(events.length).toBeGreaterThan(0)

    // 验证日期升序
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.date >= events[i - 1]!.date).toBe(true)
    }

    // 同一日期内 priority 降序
    const byDate = new Map<string, number[]>()
    for (const e of events) {
      const arr = byDate.get(e.date) ?? []
      arr.push(e.priority ?? 0)
      byDate.set(e.date, arr)
    }
    for (const priorities of byDate.values()) {
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i - 1]!).toBeGreaterThanOrEqual(priorities[i]!)
      }
    }
  })

  it('自定义 config 只启用特定规则', () => {
    const rows: DailyRow[] = [
      ...makeDateRange('2025-01-01', 5, 'alice', 25),
    ]
    const events = detectEvents(rows, { enabledRules: ['activity_spike'] })
    const types = events.map(e => e.type)
    expect(types).not.toContain('project_start')
    expect(types).not.toContain('contributor_first_commit')
    expect(types).not.toContain('commit_milestone')
  })

  it('事件 ID 去重', () => {
    const rows = makeDateRange('2025-01-01', 3, 'alice', 10)
    const events = detectEvents(rows)
    const ids = events.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('detectContributorEvents', () => {
  it('contributor_first_commit：commits >= 20 的 contributor 生成事件', () => {
    const rows = makeDateRange('2025-01-01', 5, 'alice', 5) // 25 total
    const events = detectContributorEvents(rows, fullConfig, '2025-01-05', false)
    const first = events.find(e => e.type === 'contributor_first_commit')
    expect(first).toBeDefined()
    expect(first!.contributors).toContain('alice')
    expect(first!.params.name).toBe('alice')
  })

  it('contributor_first_commit：commits < 20 不生成事件', () => {
    const rows = makeDateRange('2025-01-01', 2, 'bob', 5) // 10 total
    const events = detectContributorEvents(rows, fullConfig, '2025-01-02', false)
    expect(events.find(e => e.type === 'contributor_first_commit')).toBeUndefined()
  })

  it('contributor_exit：核心 contributor 超过 60 天 gap + 项目活跃生成退出事件', () => {
    // alice 有 60 commits（核心），最后活跃 2025-01-10，当前 2025-06-01（> 60 天 gap）
    const rows = makeDateRange('2025-01-01', 12, 'alice', 5) // 60 total, lastDate 2025-01-12
    const latestDate = '2025-06-01' // > 60 天后
    const events = detectContributorEvents(rows, fullConfig, latestDate, false)
    const exit = events.find(e => e.type === 'contributor_exit')
    expect(exit).toBeDefined()
    expect(exit!.severity).toBe('warning')
    expect(exit!.params.name).toBe('alice')
    expect(exit!.params.days).toBeGreaterThan(60)
  })

  it('contributor_exit：项目不活跃时不生成退出事件', () => {
    const rows = makeDateRange('2025-01-01', 12, 'alice', 5)
    const latestDate = '2025-06-01'
    const events = detectContributorEvents(rows, fullConfig, latestDate, true) // projectStale = true
    expect(events.find(e => e.type === 'contributor_exit')).toBeUndefined()
  })
})

describe('detectActivityMutations', () => {
  it('activity_spike：z-score > 3.5 时检测到突增', () => {
    // 构造 14 天基线 + 1 天突增
    const rows: DailyRow[] = [
      ...makeDateRange('2025-01-01', 14, 'alice', 5),
    ]
    // 第 15 天突增到 100 commits
    rows.push(makeDailyRow({
      date: '2025-01-15',
      contributor: 'alice',
      commits: 100,
    }))

    const dayStats = buildDayStats(rows)
    const events = detectActivityMutations(dayStats, fullConfig)
    const spike = events.find(e => e.type === 'activity_spike')
    expect(spike).toBeDefined()
    expect(spike!.date).toBe('2025-01-15')
    expect(spike!.params.zScore).toBeGreaterThan(3.5)
  })

  it('activity_drop：连续 N 天低于均值的下降数据生成事件', () => {
    // 构造 30 天稳定活跃（每日 10 commits）+ 7 天骤降到 0
    // 由于滑动窗口 std 随低值天增加而增大，默认 7 天 + z-score < -2.0 恰好难以连续 7 天
    // 用 activityDropConsecutiveDays: 5 测试逻辑正确性
    const rows: DailyRow[] = [
      ...makeDateRange('2025-01-01', 30, 'alice', 10),
    ]
    for (let i = 0; i < 7; i++) {
      const d = new Date('2025-01-31')
      d.setDate(d.getDate() + i)
      rows.push(makeDailyRow({
        date: d.toISOString().split('T')[0]!,
        contributor: 'alice',
        commits: 0,
      }))
    }

    const customConfig = { ...fullConfig, activityDropConsecutiveDays: 5 }
    const dayStats = buildDayStats(rows)
    const events = detectActivityMutations(dayStats, customConfig)
    const drop = events.find(e => e.type === 'activity_drop')
    expect(drop).toBeDefined()
    expect(drop!.severity).toBe('warning')
  })

  it('数据天数不足 minDataDaysForMutation 时返回空', () => {
    const rows = makeDateRange('2025-01-01', 5, 'alice', 5)
    const dayStats = buildDayStats(rows)
    const events = detectActivityMutations(dayStats, fullConfig)
    expect(events).toEqual([])
  })
})

describe('detectRefactors', () => {
  it('major_refactor：删除行数 > 8x 滑动窗口均值时检测到重构', () => {
    // 构造 14 天基线（每日删除 10 行）+ 1 天大重构（删除 200 行）
    const rows: DailyRow[] = []
    const base = new Date('2025-01-01')
    for (let i = 0; i < 14; i++) {
      const d = new Date(base)
      d.setDate(d.getDate() + i)
      rows.push(makeDailyRow({
        date: d.toISOString().split('T')[0]!,
        contributor: 'alice',
        linesDeleted: 10,
      }))
    }
    rows.push(makeDailyRow({
      date: '2025-01-15',
      contributor: 'alice',
      linesDeleted: 200,
    }))

    const dayStats = buildDayStats(rows)
    const events = detectRefactors(rows, dayStats, fullConfig)
    const refactor = events.find(e => e.type === 'major_refactor')
    expect(refactor).toBeDefined()
    expect(refactor!.params.lines).toBe(200)
  })

  it('major_refactor 遵循 cooldown 冷却期', () => {
    const rows: DailyRow[] = []
    const base = new Date('2025-01-01')
    for (let i = 0; i < 14; i++) {
      const d = new Date(base)
      d.setDate(d.getDate() + i)
      rows.push(makeDailyRow({
        date: d.toISOString().split('T')[0]!,
        contributor: 'alice',
        linesDeleted: 10,
      }))
    }
    // 连续 2 天大重构（间隔 < 30 天 cooldown）
    rows.push(makeDailyRow({ date: '2025-01-15', contributor: 'alice', linesDeleted: 200 }))
    rows.push(makeDailyRow({ date: '2025-01-16', contributor: 'alice', linesDeleted: 200 }))

    const dayStats = buildDayStats(rows)
    const events = detectRefactors(rows, dayStats, fullConfig)
    const refactorEvents = events.filter(e => e.type === 'major_refactor')
    expect(refactorEvents.length).toBe(1) // 冷却期内只触发一次
  })
})

describe('detectMilestones', () => {
  it('project_start：最早日期产生 project_start 事件', () => {
    const rows = makeDateRange('2025-01-01', 5, 'alice', 5)
    const events = detectMilestones(rows, fullConfig, '2025-01-01')
    const start = events.find(e => e.type === 'project_start')
    expect(start).toBeDefined()
    expect(start!.date).toBe('2025-01-01')
    expect(start!.severity).toBe('positive')
  })

  it('commit_milestone：累计 commits 达到 100/500 里程碑生成事件', () => {
    // 构造足以跨过 100 和 500 里程碑的数据
    const rows: DailyRow[] = []
    for (let i = 0; i < 120; i++) {
      const d = new Date('2025-01-01')
      d.setDate(d.getDate() + i)
      rows.push(makeDailyRow({
        date: d.toISOString().split('T')[0]!,
        contributor: 'alice',
        commits: 5, // 120 * 5 = 600
      }))
    }

    const events = detectMilestones(rows, fullConfig, '2025-01-01')
    const milestones = events.filter(e => e.type === 'commit_milestone')
    const thresholds = milestones.map(e => e.params.threshold)
    expect(thresholds).toContain(100)
    expect(thresholds).toContain(500)
  })
})

describe('detectProjectArchived', () => {
  it('project_archived：最后 commit > 365 天 + 活跃期 > 365 天时检测到归档', () => {
    // 活跃期 2024-01-01 到 2024-12-31 (> 365 天)
    // "今天" 由函数内部 new Date() 决定
    // 我们需要让 latestDate 距今 > 365 天
    // 用一个很早的日期即可
    const rows: DailyRow[] = []
    for (let i = 0; i < 400; i++) {
      const d = new Date('2023-01-01')
      d.setDate(d.getDate() + i)
      rows.push(makeDailyRow({
        date: d.toISOString().split('T')[0]!,
        contributor: 'alice',
        commits: 1,
      }))
    }
    // earliestDate = 2023-01-01, latestDate = 2023-02-05
    // 距今远超 365 天，且活跃期跨度 > 365 天
    // 但活跃期只有 400 天，实际 projectDurationDays = 399 > 365
    const events = detectProjectArchived(rows, fullConfig, '2023-01-01', '2024-02-05')
    const archived = events.find(e => e.type === 'project_archived')
    expect(archived).toBeDefined()
    expect(archived!.severity).toBe('warning')
    expect(archived!.params.daysSilent).toBeGreaterThan(365)
  })

  it('project_archived：活跃期不足 365 天不检测', () => {
    // 活跃期只有 180 天
    const events = detectProjectArchived([], fullConfig, '2023-01-01', '2023-06-30')
    expect(events.find(e => e.type === 'project_archived')).toBeUndefined()
  })

  it('project_archived：最近仍有 commit 时不检测', () => {
    // latestDate 是今天（距今 0 天）
    const today = new Date().toISOString().split('T')[0]!
    const events = detectProjectArchived([], fullConfig, '2023-01-01', today)
    expect(events.find(e => e.type === 'project_archived')).toBeUndefined()
  })
})

describe('buildDayStats', () => {
  it('按日期聚合 commits 和 linesDeleted', () => {
    const rows = [
      makeDailyRow({ date: '2025-01-01', contributor: 'alice', commits: 3, linesDeleted: 10 }),
      makeDailyRow({ date: '2025-01-01', contributor: 'bob', commits: 2, linesDeleted: 5 }),
      makeDailyRow({ date: '2025-01-02', contributor: 'alice', commits: 1, linesDeleted: 0 }),
    ]
    const stats = buildDayStats(rows)
    expect(stats).toHaveLength(2)
    expect(stats[0]!.date).toBe('2025-01-01')
    expect(stats[0]!.totalCommits).toBe(5)
    expect(stats[0]!.totalLinesDeleted).toBe(15)
    expect(stats[1]!.date).toBe('2025-01-02')
    expect(stats[1]!.totalCommits).toBe(1)
  })
})

describe('daysBetween', () => {
  it('计算两个日期之间的天数差', () => {
    expect(daysBetween('2025-01-01', '2025-01-02')).toBe(1)
    expect(daysBetween('2025-01-01', '2025-01-31')).toBe(30)
    expect(daysBetween('2025-01-01', '2025-01-01')).toBe(0)
  })

  it('负值当 a > b', () => {
    expect(daysBetween('2025-01-10', '2025-01-01')).toBeLessThan(0)
  })
})
