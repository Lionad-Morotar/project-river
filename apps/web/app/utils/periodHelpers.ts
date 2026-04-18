/** Extract year from "YYYY-MM" */
export function monthToYear(ym: string): string {
  return ym.substring(0, 4)
}

/** "2025" → { start: "2025-01-01", end: "2026-01-01" } (end is exclusive) */
export function yearToRange(y: string): { start: string, end: string } {
  const nextYear = Number(y) + 1
  return { start: `${y}-01-01`, end: `${nextYear}-01-01` }
}

/** Generate sorted unique years from "YYYY-MM" strings */
export function generateYears(months: string[]): string[] {
  const seen = new Set<string>()
  for (const m of months)
    seen.add(monthToYear(m))
  return Array.from(seen).sort()
}
