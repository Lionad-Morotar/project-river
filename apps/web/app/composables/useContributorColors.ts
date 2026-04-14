/**
 * Contributor color generator — monochromatic blue palette.
 *
 * All contributors share the same hue family (blue, ~210°) and are
 * distinguished by lightness variation.  Golden-ratio spacing over
 * the lightness domain ensures adjacent layers stay visually separable
 * even after D3's stackOrderInsideOut reordering.
 *
 * The narrow hue range (210–230) adds subtle warmth variation without
 * breaking the cohesive blue identity.
 */

/** Fibonacci golden ratio — distributes points maximally in [0,1) */
const PHI = 0.618033988749895

const HUE_BASE = 215
const HUE_RANGE = 15 // 215–230
const SAT_MIN = 45
const SAT_RANGE = 25 // 45–70%
const LIGHT_MIN = 30
const LIGHT_RANGE = 42 // 30–72%

export function getContributorColor(index: number): string {
  const t = (index * PHI) % 1
  const hue = HUE_BASE + (t * HUE_RANGE)
  const sat = SAT_MIN + (1 - t) * SAT_RANGE
  const light = LIGHT_MIN + t * LIGHT_RANGE
  return `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`
}

export function useContributorColors(contributors: string[]): Map<string, string> {
  const unique = Array.from(new Set(contributors)).sort()
  const map = new Map<string, string>()
  for (let i = 0; i < unique.length; i++) {
    map.set(unique[i], getContributorColor(i))
  }
  return map
}
