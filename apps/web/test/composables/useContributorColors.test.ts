import { describe, expect, it } from 'vitest'
import { getContributorColor, useContributorColors } from '../../app/composables/useContributorColors'

describe('getContributorColor', () => {
  it('returns a valid HSL string starting with hsl(', () => {
    const color = getContributorColor(0)
    expect(color).toMatch(/^hsl\(/)
  })

  it('returns the same color for the same index (deterministic)', () => {
    const a = getContributorColor(0)
    const b = getContributorColor(0)
    expect(a).toBe(b)
  })

  it('returns different colors for different indices', () => {
    const a = getContributorColor(0)
    const b = getContributorColor(1)
    expect(a).not.toBe(b)
  })
})

describe('useContributorColors', () => {
  it('returns a Map with distinct HSL colors for each contributor', () => {
    const map = useContributorColors(['alice', 'bob'])
    expect(map.has('alice')).toBe(true)
    expect(map.has('bob')).toBe(true)
    const aliceColor = map.get('alice')
    const bobColor = map.get('bob')
    expect(aliceColor).toMatch(/^hsl\(/)
    expect(bobColor).toMatch(/^hsl\(/)
    expect(aliceColor).not.toBe(bobColor)
  })

  it('sorts contributors alphabetically when assigning colors', () => {
    const map = useContributorColors(['bob', 'alice'])
    expect(map.get('alice')).toBe(getContributorColor(0))
    expect(map.get('bob')).toBe(getContributorColor(1))
  })

  it('deduplicates contributors', () => {
    const map = useContributorColors(['alice', 'alice', 'bob'])
    expect(map.size).toBe(2)
    expect(map.get('alice')).toBe(getContributorColor(0))
    expect(map.get('bob')).toBe(getContributorColor(1))
  })
})
