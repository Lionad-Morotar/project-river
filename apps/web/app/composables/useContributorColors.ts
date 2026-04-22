import { OTHERS_LABEL } from './useStreamgraphData'

/**
 * Contributor color generator — HSL mapped by contributor age and volume.
 *
 * Hue is driven by first commit date (older = cooler/lower hue, newer = warmer/higher hue).
 * Saturation is driven by total contribution volume (low = near-neutral, high = vivid).
 * Lightness is fixed for readability against the light background.
 */

export interface ContributorMeta {
  name: string
  firstCommitDate: string // ISO date, e.g. '2024-01-01'
  totalCommits: number
}

function othersColor(isDark = true): string {
  return isDark ? '#94a3b8' : '#64748b'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getContributorHsl(
  meta: ContributorMeta,
  bounds: { minDate: string, maxDate: string },
  maxCommits: number,
  isDark = true,
  baseHue = 160,
  hueSpread = 120,
): string {
  const minTime = new Date(bounds.minDate).getTime()
  const maxTime = new Date(bounds.maxDate).getTime()
  const dateSpan = maxTime - minTime || 1

  const tDate = clamp((new Date(meta.firstCommitDate).getTime() - minTime) / dateSpan, 0, 1)
  const hue = baseHue + tDate * hueSpread

  const denominator = Math.log10(maxCommits + 1) || 1
  const tVolume = clamp(Math.log10(meta.totalCommits + 1) / denominator, 0, 1)
  const saturation = 15 + tVolume * 60

  const lightness = isDark ? 55 : 42
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${lightness}%)`
}

export function useContributorColors(contributors: ContributorMeta[], isDark = true, baseHue = 160, hueSpread = 120): Map<string, string> {
  if (contributors.length === 0) {
    return new Map<string, string>()
  }

  const minDate = contributors.reduce((min, c) => c.firstCommitDate < min ? c.firstCommitDate : min, contributors[0]!.firstCommitDate)
  const maxDate = contributors.reduce((max, c) => c.firstCommitDate > max ? c.firstCommitDate : max, contributors[0]!.firstCommitDate)
  const maxCommits = contributors.reduce((max, c) => Math.max(max, c.totalCommits), 0)

  const bounds = { minDate, maxDate }
  const unique = Array.from(new Map(contributors.map(c => [c.name, c])).values())
    .sort((a, b) => a.name.localeCompare(b.name))

  const map = new Map<string, string>()
  for (const meta of unique) {
    if (meta.name === OTHERS_LABEL) {
      map.set(meta.name, othersColor(isDark))
    }
    else {
      map.set(meta.name, getContributorHsl(meta, bounds, maxCommits, isDark, baseHue, hueSpread))
    }
  }
  return map
}
