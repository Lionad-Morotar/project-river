/** "2025-03" → "2025-Q1" */
export function monthToQuarter(ym: string): string {
  const month = Number(ym.substring(5, 7))
  const q = Math.ceil(month / 3)
  return `${ym.substring(0, 4)}-Q${q}`
}

/** "2025-Q1" → { start: "2025-01-01", end: "2025-04-01" } (end is exclusive first day of next quarter) */
export function quarterToMonthRange(q: string): { start: string, end: string } {
  const year = q.substring(0, 4)
  const qNum = Number(q.substring(6))
  const startMonth = (qNum - 1) * 3 + 1
  const endMonth = startMonth + 3
  const startY = Number(year)
  const endY = endMonth > 12 ? startY + 1 : startY
  const adjustedEnd = endMonth > 12 ? endMonth - 12 : endMonth
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${endY}-${String(adjustedEnd).padStart(2, '0')}-01`,
  }
}

/** "2025-Q1" → "2025 Q1" */
export function quarterLabel(q: string): string {
  return q.replace('-Q', ' Q')
}

/** Generate sorted unique quarters from a list of "YYYY-MM" strings */
export function generateQuarters(months: string[]): string[] {
  const seen = new Set<string>()
  for (const m of months) {
    seen.add(monthToQuarter(m))
  }
  return Array.from(seen).sort()
}

/** Previous quarter: "2025-Q1" → "2024-Q4" */
export function prevQuarter(q: string): string {
  const year = Number(q.substring(0, 4))
  const qNum = Number(q.substring(6))
  if (qNum === 1)
    return `${year - 1}-Q4`
  return `${year}-Q${qNum - 1}`
}
