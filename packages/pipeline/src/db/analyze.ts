import type { ParsedCommit } from '../types.ts'
import { realpath } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { db } from '@project-river/db/client'
import { commit_files, commits, daily_stats, projects } from '@project-river/db/schema'
import { eq, sql } from 'drizzle-orm'
import { calcDay } from '../calcDay.ts'
import { parseRepo } from '../parser.ts'
import { buildGitignoreLookup, getGitignoreHistory } from './gitignore.ts'
import { generateSumDay } from './sumDay.ts'

interface AnalyzeOptions {
  batchSize: number
  force: boolean
  ignore?: boolean
  incremental: boolean
}

export async function analyzeRepo(
  repoPath: string,
  projectName: string | undefined,
  options: AnalyzeOptions,
): Promise<void> {
  // Normalize to absolute real path (resolves symlinks, .., //, trailing slashes)
  let normalizedPath: string
  try {
    normalizedPath = await realpath(resolve(repoPath))
  }
  catch (err) {
    throw new Error(`Path does not exist: ${repoPath}`, { cause: err })
  }

  const name = projectName ?? basename(normalizedPath)

  const existingRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.path, normalizedPath))

  const existing = existingRows[0]

  if (existing && !options.force && !options.incremental) {
    throw new Error(`Project already analyzed: ${normalizedPath}. Use --force or --incremental.`)
  }

  let projectId: number

  if (existing && options.force) {
    await db.delete(projects).where(eq(projects.id, existing.id))
    const inserted = await db
      .insert(projects)
      .values({ name, path: normalizedPath })
      .returning({ id: projects.id })
    projectId = inserted[0]!.id
  }
  else if (!existing) {
    const inserted = await db
      .insert(projects)
      .values({ name, path: normalizedPath })
      .returning({ id: projects.id })
    projectId = inserted[0]!.id
  }
  else {
    projectId = existing.id
  }

  let existingHashes: Set<string> | undefined
  if (options.incremental && existing) {
    const rows = await db
      .select({ hash: commits.hash })
      .from(commits)
      .where(eq(commits.projectId, projectId))
    existingHashes = new Set(rows.map(r => r.hash))
  }

  const allCommits: ParsedCommit[] = []
  for await (const commit of parseRepo(normalizedPath)) {
    if (existingHashes?.has(commit.hash)) {
      continue
    }
    allCommits.push(commit)
  }

  // Build .gitignore pattern lookup for each commit (only when --ignore is enabled)
  let gitignoreLookup: Map<string, string> | undefined
  if (options.ignore !== false) {
    const gitignoreHistory = await getGitignoreHistory(normalizedPath)

    // For correct pattern tracking, we need SHAs in chronological order (oldest → newest).
    // parseRepo yields newest-first (git log default), so reverse.
    // In incremental mode, prepend existing commit SHAs from DB so that gitignore
    // pattern evolution from the repo's beginning is properly tracked.
    let chronologicalShas: string[]
    if (options.incremental && existingHashes && existingHashes.size > 0) {
      const existingOrdered = await db
        .select({ hash: commits.hash })
        .from(commits)
        .where(eq(commits.projectId, projectId))
        .orderBy(commits.committerDate)
      chronologicalShas = [
        ...existingOrdered.map(r => r.hash),
        ...[...allCommits].reverse().map(c => c.hash),
      ]
    }
    else {
      chronologicalShas = [...allCommits].reverse().map(c => c.hash)
    }

    gitignoreLookup = buildGitignoreLookup(chronologicalShas, gitignoreHistory)
  }

  let monthCommits: ParsedCommit[] = []
  let currentMonth = ''

  async function flushMonth(): Promise<void> {
    if (monthCommits.length === 0)
      return

    const dailyStats = calcDay(monthCommits)

    await db.transaction(async (tx) => {
      const commitRows: { id: number, hash: string }[] = []

      for (let i = 0; i < monthCommits.length; i += options.batchSize) {
        const chunk = monthCommits.slice(i, i + options.batchSize)
        const values = chunk.map(c => ({
          projectId,
          hash: c.hash,
          authorName: c.authorName,
          authorEmail: c.authorEmail,
          committerDate: c.committerDate,
          message: c.message,
        }))
        const inserted = await tx.insert(commits).values(values).returning({ id: commits.id, hash: commits.hash })
        commitRows.push(...inserted)
      }

      const hashToId = new Map<string, number>()
      for (const row of commitRows) {
        hashToId.set(row.hash, row.id)
      }

      const { filterIgnoredFiles } = await import('./gitignore.ts')

      const fileRows: { commitId: number, projectId: number, path: string, insertions: number, deletions: number }[] = []
      for (const c of monthCommits) {
        const commitId = hashToId.get(c.hash)
        if (!commitId)
          continue
        const files = (options.ignore !== false && gitignoreLookup)
          ? filterIgnoredFiles(c.files, gitignoreLookup.get(c.hash) ?? '')
          : c.files
        for (const f of files) {
          fileRows.push({
            commitId,
            projectId,
            path: f.path,
            insertions: f.insertions,
            deletions: f.deletions,
          })
        }
      }

      for (let i = 0; i < fileRows.length; i += options.batchSize) {
        const chunk = fileRows.slice(i, i + options.batchSize)
        await tx.insert(commit_files).values(chunk)
      }

      const statRows = dailyStats.map(d => ({
        projectId,
        date: d.date,
        contributor: d.contributor,
        commits: d.commits,
        insertions: d.insertions,
        deletions: d.deletions,
        filesTouched: d.filesTouched,
      }))

      for (let i = 0; i < statRows.length; i += options.batchSize) {
        const chunk = statRows.slice(i, i + options.batchSize)
        await tx.insert(daily_stats).values(chunk).onConflictDoUpdate({
          target: [daily_stats.projectId, daily_stats.date, daily_stats.contributor],
          set: {
            commits: sql`daily_stats.commits + excluded.commits`,
            insertions: sql`daily_stats.insertions + excluded.insertions`,
            deletions: sql`daily_stats.deletions + excluded.deletions`,
            filesTouched: sql`daily_stats.files_touched + excluded.files_touched`,
          },
        })
      }
    })

    monthCommits = []
  }

  for (const commit of allCommits) {
    const month = commit.committerDate.toISOString().slice(0, 7)
    if (currentMonth && month !== currentMonth) {
      await flushMonth()
    }
    currentMonth = month
    monthCommits.push(commit)
  }

  await flushMonth()
  await generateSumDay(projectId)
}
