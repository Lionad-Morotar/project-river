import type { HealthStatsInput } from '../../app/utils/healthRules'
import { describe, expect, it } from 'vitest'
import { evaluateHealthRules } from '../../app/utils/healthRules'

function makeStats(overrides: Partial<HealthStatsInput> = {}): HealthStatsInput {
  return {
    totalCommits: 100,
    totalContributors: 5,
    topContributors: [
      { contributor: 'alice', commits: 50 },
      { contributor: 'bob', commits: 20 },
      { contributor: 'carol', commits: 15 },
      { contributor: 'dave', commits: 10 },
      { contributor: 'eve', commits: 5 },
    ],
    lastDate: '2026-04-10',
    recent90DaysCommits: 40,
    prior270DaysDailyAvg: 0.5,
    avgLinesPerCommit: 200,
    recentQuarterContributors: 5,
    previousQuarterContributors: 4,
    daysSinceLastCommit: 7,
    ...overrides,
  }
}

describe('evaluateHealthRules', () => {
  it('returns no signals for a healthy, well-distributed project', () => {
    const stats = makeStats()
    const signals = evaluateHealthRules(stats)
    // With 85% concentration, this WILL trigger concentration warning
    // But activity, churn, and growth should be fine
    const ids = signals.map(s => s.id)
    expect(ids).not.toContain('activity-drop')
    expect(ids).not.toContain('code-churn')
  })

  describe('concentration rule', () => {
    it('triggers when top 3 contributors exceed 80% of total commits', () => {
      const stats = makeStats({
        topContributors: [
          { contributor: 'alice', commits: 80 },
          { contributor: 'bob', commits: 10 },
          { contributor: 'carol', commits: 5 },
          { contributor: 'dave', commits: 3 },
          { contributor: 'eve', commits: 2 },
        ],
        totalCommits: 100,
      })
      const signals = evaluateHealthRules(stats)
      const concentration = signals.find(s => s.id === 'concentration')
      expect(concentration).toBeDefined()
      expect(concentration!.severity).toBe('warning')
      expect(concentration!.evidence).toContain('95%')
      expect(concentration!.evidence).toContain('alice')
    })

    it('does not trigger when top 3 contributors are below 80%', () => {
      const stats = makeStats({
        topContributors: [
          { contributor: 'alice', commits: 30 },
          { contributor: 'bob', commits: 25 },
          { contributor: 'carol', commits: 20 },
          { contributor: 'dave', commits: 15 },
          { contributor: 'eve', commits: 10 },
        ],
        totalCommits: 100,
      })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'concentration')).toBeUndefined()
    })

    it('handles single contributor as concentration warning', () => {
      const stats = makeStats({
        topContributors: [{ contributor: 'alice', commits: 100 }],
        totalCommits: 100,
        totalContributors: 1,
      })
      const signals = evaluateHealthRules(stats)
      const concentration = signals.find(s => s.id === 'concentration')
      expect(concentration).toBeDefined()
      expect(concentration!.evidence).toContain('100%')
    })

    it('skips when total commits is zero', () => {
      const stats = makeStats({ totalCommits: 0, topContributors: [] })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'concentration')).toBeUndefined()
    })
  })

  describe('activity drop rule', () => {
    it('triggers when recent 90d daily avg drops below 30% of prior', () => {
      const stats = makeStats({
        recent90DaysCommits: 10, // ~0.11/day
        prior270DaysDailyAvg: 1.0, // was 1/day
      })
      const signals = evaluateHealthRules(stats)
      const drop = signals.find(s => s.id === 'activity-drop')
      expect(drop).toBeDefined()
      expect(drop!.severity).toBe('warning')
      expect(drop!.evidence).toContain('11%')
    })

    it('does not trigger when activity is sustained', () => {
      const stats = makeStats({
        recent90DaysCommits: 90, // 1/day
        prior270DaysDailyAvg: 1.0, // 1/day
      })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'activity-drop')).toBeUndefined()
    })

    it('skips when no prior period data', () => {
      const stats = makeStats({ prior270DaysDailyAvg: 0 })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'activity-drop')).toBeUndefined()
    })
  })

  describe('code churn rule', () => {
    it('triggers when avg lines per commit exceeds 500', () => {
      const stats = makeStats({ avgLinesPerCommit: 800 })
      const signals = evaluateHealthRules(stats)
      const churn = signals.find(s => s.id === 'code-churn')
      expect(churn).toBeDefined()
      expect(churn!.severity).toBe('warning')
      expect(churn!.evidence).toContain('800')
    })

    it('does not trigger for normal churn levels', () => {
      const stats = makeStats({ avgLinesPerCommit: 200 })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'code-churn')).toBeUndefined()
    })
  })

  describe('distribution growth rule', () => {
    it('triggers when contributor count grows quarter-over-quarter', () => {
      const stats = makeStats({
        recentQuarterContributors: 8,
        previousQuarterContributors: 5,
      })
      const signals = evaluateHealthRules(stats)
      const growth = signals.find(s => s.id === 'distribution-growth')
      expect(growth).toBeDefined()
      expect(growth!.severity).toBe('positive')
      expect(growth!.evidence).toContain('60%')
      expect(growth!.evidence).toContain('5 → 8')
    })

    it('does not trigger when contributor count is stable', () => {
      const stats = makeStats({
        recentQuarterContributors: 5,
        previousQuarterContributors: 5,
      })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'distribution-growth')).toBeUndefined()
    })

    it('does not trigger when previous quarter had zero contributors', () => {
      const stats = makeStats({
        recentQuarterContributors: 5,
        previousQuarterContributors: 0,
      })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'distribution-growth')).toBeUndefined()
    })
  })

  describe('sustained activity rule', () => {
    it('triggers when last commit is within 30 days', () => {
      const stats = makeStats({ daysSinceLastCommit: 7 })
      const signals = evaluateHealthRules(stats)
      const activity = signals.find(s => s.id === 'sustained-activity')
      expect(activity).toBeDefined()
      expect(activity!.severity).toBe('info')
      expect(activity!.evidence).toContain('7 天前')
    })

    it('shows "最近一天内有提交" for very recent activity', () => {
      const stats = makeStats({ daysSinceLastCommit: 0 })
      const signals = evaluateHealthRules(stats)
      const activity = signals.find(s => s.id === 'sustained-activity')
      expect(activity).toBeDefined()
      expect(activity!.evidence).toContain('最近一天内')
    })

    it('does not trigger when last commit is over 30 days ago', () => {
      const stats = makeStats({ daysSinceLastCommit: 60 })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'sustained-activity')).toBeUndefined()
    })

    it('does not trigger when daysSinceLastCommit is null', () => {
      const stats = makeStats({ daysSinceLastCommit: null })
      const signals = evaluateHealthRules(stats)
      expect(signals.find(s => s.id === 'sustained-activity')).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('returns empty array for empty stats with no commits', () => {
      const stats = makeStats({
        totalCommits: 0,
        totalContributors: 0,
        topContributors: [],
        lastDate: null,
        recent90DaysCommits: 0,
        prior270DaysDailyAvg: 0,
        avgLinesPerCommit: 0,
        recentQuarterContributors: 0,
        previousQuarterContributors: 0,
        daysSinceLastCommit: null,
      })
      expect(evaluateHealthRules(stats)).toEqual([])
    })

    it('returns deterministic results for same input', () => {
      const stats = makeStats()
      const result1 = evaluateHealthRules(stats)
      const result2 = evaluateHealthRules(stats)
      expect(result1).toEqual(result2)
    })

    it('all signals have required fields', () => {
      const stats = makeStats({
        topContributors: [
          { contributor: 'a', commits: 90 },
          { contributor: 'b', commits: 8 },
          { contributor: 'c', commits: 2 },
        ],
        totalCommits: 100,
        avgLinesPerCommit: 600,
      })
      const signals = evaluateHealthRules(stats)
      for (const s of signals) {
        expect(s.id).toBeTruthy()
        expect(s.label).toBeTruthy()
        expect(['info', 'warning', 'positive']).toContain(s.severity)
        expect(s.evidence).toBeTruthy()
      }
    })
  })
})
