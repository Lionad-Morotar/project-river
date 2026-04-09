export const GOLDEN_ANGLE = 137.508

export function getContributorColor(index: number, s = 70, l = 50): string {
  return `hsl(${Math.round((index * GOLDEN_ANGLE) % 360)}, ${s}%, ${l}%)`
}

export function useContributorColors(contributors: string[]): Map<string, string> {
  const unique = Array.from(new Set(contributors)).sort()
  const map = new Map<string, string>()
  for (let i = 0; i < unique.length; i++) {
    map.set(unique[i], getContributorColor(i))
  }
  return map
}
