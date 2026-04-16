import type { ContributorMeta } from '../../app/composables/useContributorColors'
import { describe, expect, it } from 'vitest'
import { getContributorHsl, useContributorColors } from '../../app/composables/useContributorColors'
import { OTHERS_LABEL } from '../../app/composables/useStreamgraphData'

describe('getContributorHsl', () => {
  const bounds = { minDate: '2024-01-01', maxDate: '2024-01-31' }
  const maxCommits = 100

  it('maps older firstCommitDate to hue near 160°', () => {
    const meta: ContributorMeta = { name: 'alice', firstCommitDate: '2024-01-01', totalCommits: 10 }
    const color = getContributorHsl(meta, bounds, maxCommits)
    const hue = Number(color.match(/hsl\((\d+)/)?.[1])
    expect(hue).toBeGreaterThanOrEqual(160)
    expect(hue).toBeLessThanOrEqual(170)
  })

  it('maps newer firstCommitDate to hue near 280°', () => {
    const meta: ContributorMeta = { name: 'bob', firstCommitDate: '2024-01-31', totalCommits: 10 }
    const color = getContributorHsl(meta, bounds, maxCommits)
    const hue = Number(color.match(/hsl\((\d+)/)?.[1])
    expect(hue).toBeGreaterThanOrEqual(270)
    expect(hue).toBeLessThanOrEqual(280)
  })

  it('maps high totalCommits to higher saturation than low totalCommits', () => {
    const low: ContributorMeta = { name: 'low', firstCommitDate: '2024-01-15', totalCommits: 1 }
    const high: ContributorMeta = { name: 'high', firstCommitDate: '2024-01-15', totalCommits: 100 }
    const lowColor = getContributorHsl(low, bounds, maxCommits)
    const highColor = getContributorHsl(high, bounds, maxCommits)
    const lowSat = Number(lowColor.match(/hsl\(\d+,\s*(\d+)%/)?.[1])
    const highSat = Number(highColor.match(/hsl\(\d+,\s*(\d+)%/)?.[1])
    expect(highSat).toBeGreaterThan(lowSat)
  })

  it('returns deterministic colors for the same input', () => {
    const meta: ContributorMeta = { name: 'alice', firstCommitDate: '2024-01-10', totalCommits: 42 }
    const a = getContributorHsl(meta, bounds, maxCommits)
    const b = getContributorHsl(meta, bounds, maxCommits)
    expect(a).toBe(b)
  })

  it('clamps hue and saturation for edge dates and commit counts', () => {
    const early: ContributorMeta = { name: 'early', firstCommitDate: '2023-12-01', totalCommits: 0 }
    const late: ContributorMeta = { name: 'late', firstCommitDate: '2025-01-01', totalCommits: 9999 }
    const earlyColor = getContributorHsl(early, bounds, maxCommits)
    const lateColor = getContributorHsl(late, bounds, maxCommits)
    const earlyHue = Number(earlyColor.match(/hsl\((\d+)/)?.[1])
    const lateHue = Number(lateColor.match(/hsl\((\d+)/)?.[1])
    expect(earlyHue).toBeGreaterThanOrEqual(160)
    expect(lateHue).toBeLessThanOrEqual(280)
    const earlySat = Number(earlyColor.match(/hsl\(\d+,\s*(\d+)%/)?.[1])
    const lateSat = Number(lateColor.match(/hsl\(\d+,\s*(\d+)%/)?.[1])
    expect(earlySat).toBeGreaterThanOrEqual(10)
    expect(earlySat).toBeLessThanOrEqual(80)
    expect(lateSat).toBeGreaterThanOrEqual(10)
    expect(lateSat).toBeLessThanOrEqual(80)
  })

  it('fixes lightness at 55%', () => {
    const meta: ContributorMeta = { name: 'alice', firstCommitDate: '2024-01-15', totalCommits: 10 }
    const color = getContributorHsl(meta, bounds, maxCommits)
    expect(color).toMatch(/55%/)
  })
})

describe('useContributorColors', () => {
  it('returns a Map with HSL colors mapped by contributor name', () => {
    const contributors: ContributorMeta[] = [
      { name: 'alice', firstCommitDate: '2024-01-01', totalCommits: 10 },
      { name: 'bob', firstCommitDate: '2024-01-15', totalCommits: 50 },
    ]
    const map = useContributorColors(contributors)
    expect(map.has('alice')).toBe(true)
    expect(map.has('bob')).toBe(true)
    expect(map.get('alice')).toMatch(/^hsl\(/)
    expect(map.get('bob')).toMatch(/^hsl\(/)
  })

  it('sorts contributors alphabetically for stability', () => {
    const contributors: ContributorMeta[] = [
      { name: 'bob', firstCommitDate: '2024-01-15', totalCommits: 50 },
      { name: 'alice', firstCommitDate: '2024-01-01', totalCommits: 10 },
    ]
    const map = useContributorColors(contributors)
    const keys = Array.from(map.keys())
    expect(keys).toEqual(['alice', 'bob'])
  })

  it('maps OTHERS_LABEL to #94a3b8', () => {
    const contributors: ContributorMeta[] = [
      { name: OTHERS_LABEL, firstCommitDate: '2024-01-01', totalCommits: 5 },
    ]
    const map = useContributorColors(contributors)
    expect(map.get(OTHERS_LABEL)).toBe('#94a3b8')
  })

  it('computes bounds and maxCommits from the provided metadata', () => {
    const contributors: ContributorMeta[] = [
      { name: 'alice', firstCommitDate: '2024-01-01', totalCommits: 10 },
      { name: 'bob', firstCommitDate: '2024-01-31', totalCommits: 100 },
    ]
    const map = useContributorColors(contributors)
    const aliceColor = map.get('alice')!
    const bobColor = map.get('bob')!
    const aliceHue = Number(aliceColor.match(/hsl\((\d+)/)?.[1])
    const bobHue = Number(bobColor.match(/hsl\((\d+)/)?.[1])
    expect(aliceHue).toBeLessThan(bobHue)
  })
})
