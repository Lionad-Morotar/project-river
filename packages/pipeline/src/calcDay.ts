import type { ParsedCommit } from './types.ts'

export interface DailyStat {
  date: string // YYYY-MM-DD in UTC
  contributor: string // authorEmail
  commits: number
  insertions: number
  deletions: number
  filesTouched: number
}

export function calcDay(commits: ParsedCommit[]): DailyStat[] {
  const map = new Map<string, { commits: number, insertions: number, deletions: number, files: Set<string> }>()

  for (const c of commits) {
    const utcDate = c.committerDate.toISOString().slice(0, 10)
    const key = `${utcDate}::${c.authorEmail}`

    const insertions = c.files.reduce((s, f) => s + f.insertions, 0)
    const deletions = c.files.reduce((s, f) => s + f.deletions, 0)

    const existing = map.get(key)
    if (existing) {
      existing.commits += 1
      existing.insertions += insertions
      existing.deletions += deletions
      for (const f of c.files) existing.files.add(f.path)
    }
    else {
      map.set(key, {
        commits: 1,
        insertions,
        deletions,
        files: new Set(c.files.map(f => f.path)),
      })
    }
  }

  return Array.from(map.entries())
    .map(([key, value]) => {
      const [date, contributor] = key.split('::')
      return {
        date,
        contributor,
        commits: value.commits,
        insertions: value.insertions,
        deletions: value.deletions,
        filesTouched: value.files.size,
      }
    })
    .sort((a, b) => {
      if (a.date !== b.date)
        return a.date.localeCompare(b.date)
      return a.contributor.localeCompare(b.contributor)
    })
}
