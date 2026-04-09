import { execSync } from 'node:child_process'
import { mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { db, pool } from '@project-river/db/client'
import { commit_files, commits, daily_stats, projects, sum_day } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeRepo } from '../src/db/analyze.ts'

describe.sequential('analyzeRepo integration', () => {
  const projectName = 'analyze-test'
  const testRepos: string[] = []

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL is not set, skipping analyzeRepo integration tests')
      return
    }
    await db.delete(projects).where(eq(projects.name, projectName))
  })

  afterAll(async () => {
    if (!process.env.DATABASE_URL)
      return
    await db.delete(projects).where(eq(projects.name, projectName))
    await pool.end()
  })

  function makeTempGitRepo(dates: string[]): string {
    const tempDir = mkdtempSync(`${tmpdir()}/river-analyze-test-`)
    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test User"', { cwd: tempDir })
    execSync('git config user.email "test@example.com"', { cwd: tempDir })

    dates.forEach((date, index) => {
      const filename = `file-${index}.txt`
      writeFileSync(`${tempDir}/${filename}`, `content ${index}\n`)
      execSync('git add .', { cwd: tempDir })
      execSync(`git commit -m "commit ${index}"`, {
        cwd: tempDir,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      })
    })

    testRepos.push(tempDir)
    return tempDir
  }

  it('force: true writes commits and daily stats correctly across months', { timeout: 30000 }, async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL missing, skipping')
      return
    }

    const repo = makeTempGitRepo([
      '2024-01-15T10:00:00Z',
      '2024-02-15T10:00:00Z',
    ])

    await analyzeRepo(repo, projectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })

    const projectRows = await db.select().from(projects).where(eq(projects.name, projectName))
    expect(projectRows).toHaveLength(1)
    const projectId = projectRows[0]!.id

    const commitRows = await db.select().from(commits).where(eq(commits.projectId, projectId))
    expect(commitRows).toHaveLength(2)

    const fileRows = await db.select().from(commit_files).where(eq(commit_files.commitId, commitRows[0]!.id))
    expect(fileRows.length).toBeGreaterThanOrEqual(1)

    const statRows = await db.select().from(daily_stats).where(eq(daily_stats.projectId, projectId))
    expect(statRows).toHaveLength(2)

    const sumRows = await db.select().from(sum_day).where(eq(sum_day.projectId, projectId))
    expect(sumRows.length).toBeGreaterThanOrEqual(2)
  })

  it('default behavior rejects duplicate analysis', { timeout: 15000 }, async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL missing, skipping')
      return
    }

    const repo = makeTempGitRepo(['2024-03-15T10:00:00Z'])
    const duplicateProjectName = `${projectName}-dup`

    await db.delete(projects).where(eq(projects.name, duplicateProjectName))

    await analyzeRepo(repo, duplicateProjectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })

    await expect(
      analyzeRepo(repo, duplicateProjectName, {
        batchSize: 2000,
        force: false,
        incremental: false,
      }),
    ).rejects.toThrow('already analyzed')

    await db.delete(projects).where(eq(projects.name, duplicateProjectName))
  })

  it('incremental: true skips existing SHAs and appends new commits', { timeout: 30000 }, async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL missing, skipping')
      return
    }

    const repo = makeTempGitRepo([
      '2024-04-10T10:00:00Z',
      '2024-04-11T10:00:00Z',
    ])

    const incrementalProjectName = `${projectName}-inc`
    await db.delete(projects).where(eq(projects.name, incrementalProjectName))

    await analyzeRepo(repo, incrementalProjectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })

    const projectRows = await db.select().from(projects).where(eq(projects.name, incrementalProjectName))
    const projectId = projectRows[0]!.id

    const initialCommitCount = (await db.select({ count: commits.id }).from(commits).where(eq(commits.projectId, projectId))).length
    expect(initialCommitCount).toBe(2)

    writeFileSync(`${repo}/file-new.txt`, 'new content\n')
    execSync('git add .', { cwd: repo })
    execSync('git commit -m "commit 3"', {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2024-04-12T10:00:00Z',
        GIT_COMMITTER_DATE: '2024-04-12T10:00:00Z',
      },
    })

    await analyzeRepo(repo, incrementalProjectName, {
      batchSize: 2000,
      force: false,
      incremental: true,
    })

    const finalCommits = await db.select().from(commits).where(eq(commits.projectId, projectId))
    expect(finalCommits).toHaveLength(3)

    const messages = finalCommits.map(c => c.message)
    expect(messages).toContain('commit 3')

    const sumRows = await db.select().from(sum_day).where(eq(sum_day.projectId, projectId))
    expect(sumRows.length).toBeGreaterThanOrEqual(3)

    await db.delete(projects).where(eq(projects.name, incrementalProjectName))
  })
})

describe.sequential('analyzeRepo path normalization', () => {
  const cleanupProjects: string[] = []

  afterAll(async () => {
    if (!process.env.DATABASE_URL)
      return
    for (const name of cleanupProjects) {
      await db.delete(projects).where(eq(projects.name, name))
    }
    await pool.end()
  })

  it('stores absolute path when given relative path "."', { timeout: 30000 }, async () => {
    if (!process.env.DATABASE_URL)
      return

    // Create a temp git repo
    const tempDir = mkdtempSync(`${tmpdir()}/river-pathnorm-test-`)
    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test"', { cwd: tempDir })
    execSync('git config user.email "test@test.com"', { cwd: tempDir })
    writeFileSync(`${tempDir}/test.txt`, 'hello\n')
    execSync('git add .', { cwd: tempDir })
    execSync('git commit -m "init"', { cwd: tempDir })

    const projectName = 'pathnorm-dot-relative'
    cleanupProjects.push(projectName)

    // Save cwd, cd to parent, run with "."
    const originalCwd = process.cwd()
    process.chdir(tempDir)
    await analyzeRepo('.', projectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })
    process.chdir(originalCwd)

    const rows = await db.select().from(projects).where(eq(projects.name, projectName))
    expect(rows).toHaveLength(1)
    const storedPath = rows[0]!.path
    // Should be absolute path, not "."
    expect(storedPath).not.toBe('.')
    expect(storedPath).toBe(tempDir) // realpath of "." should equal tempDir

    cleanupProjects.push(projectName)
  })

  it('resolves symlink to real path', { timeout: 30000 }, async () => {
    if (!process.env.DATABASE_URL)
      return

    const realDir = mkdtempSync(`${tmpdir()}/river-real-test-`)
    const symlinkDir = `${tmpdir()}/river-symlink-test-`

    execSync('git init', { cwd: realDir })
    execSync('git config user.name "Test"', { cwd: realDir })
    execSync('git config user.email "test@test.com"', { cwd: realDir })
    writeFileSync(`${realDir}/test.txt`, 'hello\n')
    execSync('git add .', { cwd: realDir })
    execSync('git commit -m "init"', { cwd: realDir })

    // Create symlink
    symlinkSync(realDir, symlinkDir)

    const projectName = 'pathnorm-symlink'
    cleanupProjects.push(projectName)

    await analyzeRepo(symlinkDir, projectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })

    const rows = await db.select().from(projects).where(eq(projects.name, projectName))
    expect(rows).toHaveLength(1)
    const storedPath = rows[0]!.path
    // Should store the REAL path, not the symlink path
    expect(storedPath).toBe(realDir)
    expect(storedPath).not.toBe(symlinkDir)

    // Cleanup symlink
    unlinkSync(symlinkDir)
  })

  it('throws clear error for non-existent path', async () => {
    await expect(
      analyzeRepo('/nonexistent/path/that/does/not/exist', 'should-fail', {
        batchSize: 2000,
        force: false,
        incremental: false,
      }),
    ).rejects.toThrow('Path does not exist')
  })

  it('strips trailing slashes', { timeout: 30000 }, async () => {
    if (!process.env.DATABASE_URL)
      return

    const tempDir = mkdtempSync(`${tmpdir()}/river-slash-test-`)
    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test"', { cwd: tempDir })
    execSync('git config user.email "test@test.com"', { cwd: tempDir })
    writeFileSync(`${tempDir}/test.txt`, 'hello\n')
    execSync('git add .', { cwd: tempDir })
    execSync('git commit -m "init"', { cwd: tempDir })

    const projectName = 'pathnorm-slash'
    cleanupProjects.push(projectName)

    await analyzeRepo(`${tempDir}/`, projectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })

    const rows = await db.select().from(projects).where(eq(projects.name, projectName))
    expect(rows).toHaveLength(1)
    const storedPath = rows[0]!.path
    // Should NOT have trailing slash
    expect(storedPath).not.toMatch(/\/$/)
    expect(storedPath).toBe(tempDir)
  })
})
