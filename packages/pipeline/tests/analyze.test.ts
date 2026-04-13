import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { db, pool } from '@project-river/db/client'
import { commit_files, commits, daily_stats, projects, sum_day } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeRepo } from '../src/db/analyze.ts'

describe('analyzeRepo integration', () => {
  const hasDb = !!process.env.DATABASE_URL
  const projectName = 'analyze-test'
  const testRepos: string[] = []

  beforeAll(async () => {
    if (!hasDb) {
      console.warn('DATABASE_URL is not set, skipping analyzeRepo integration tests')
      return
    }
    await db.delete(projects).where(eq(projects.name, projectName))
  })

  afterAll(async () => {
    if (!hasDb)
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

  it.skipIf(!hasDb)('force: true writes commits and daily stats correctly across months', { timeout: 30000 }, async () => {
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

  it.skipIf(!hasDb)('default behavior rejects duplicate analysis', { timeout: 15000 }, async () => {
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

  it.skipIf(!hasDb)('incremental: true skips existing SHAs and appends new commits', { timeout: 30000 }, async () => {
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

  it.skipIf(!hasDb)('--ignore=false stores all files without filtering', { timeout: 30000 }, async () => {
    const tempDir = mkdtempSync(`${tmpdir()}/river-ignore-test-`)
    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test User"', { cwd: tempDir })
    execSync('git config user.email "test@example.com"', { cwd: tempDir })

    // Create a .gitignore that ignores *.log files
    writeFileSync(`${tempDir}/.gitignore`, '*.log\n')
    // Create a source file and a log file
    writeFileSync(`${tempDir}/main.ts`, 'console.log("hi")\n')
    writeFileSync(`${tempDir}/debug.log`, 'some debug output\n')
    execSync('git add .', { cwd: tempDir })
    execSync('git commit -m "add files"', {
      cwd: tempDir,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2024-05-01T10:00:00Z',
        GIT_COMMITTER_DATE: '2024-05-01T10:00:00Z',
      },
    })

    const ignoreProjectName = `${projectName}-ignore-false`
    await db.delete(projects).where(eq(projects.name, ignoreProjectName))

    await analyzeRepo(tempDir, ignoreProjectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
      ignore: false,
    })

    const projectRows = await db.select().from(projects).where(eq(projects.name, ignoreProjectName))
    const projectId = projectRows[0]!.id

    const commitRows = await db.select().from(commits).where(eq(commits.projectId, projectId))
    expect(commitRows).toHaveLength(1)

    // With --ignore=false, all committed files should be stored including debug.log
    const allFileRows = await db.select().from(commit_files).where(eq(commit_files.commitId, commitRows[0]!.id))
    const filePaths = allFileRows.map(f => f.path)
    expect(filePaths).toContain('main.ts')
    expect(filePaths).toContain('debug.log')

    await db.delete(projects).where(eq(projects.name, ignoreProjectName))
  })

  it.skipIf(!hasDb)('default (ignore=true) filters files matching .gitignore patterns', { timeout: 30000 }, async () => {
    const tempDir = mkdtempSync(`${tmpdir()}/river-ignore-true-test-`)
    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test User"', { cwd: tempDir })
    execSync('git config user.email "test@example.com"', { cwd: tempDir })

    // Create a .gitignore that ignores *.log files
    writeFileSync(`${tempDir}/.gitignore`, '*.log\n')
    // Create a source file and a log file
    writeFileSync(`${tempDir}/main.ts`, 'console.log("hi")\n')
    writeFileSync(`${tempDir}/debug.log`, 'some debug output\n')
    execSync('git add .', { cwd: tempDir })
    execSync('git commit -m "add files"', {
      cwd: tempDir,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2024-06-01T10:00:00Z',
        GIT_COMMITTER_DATE: '2024-06-01T10:00:00Z',
      },
    })

    const ignoreTrueProjectName = `${projectName}-ignore-true`
    await db.delete(projects).where(eq(projects.name, ignoreTrueProjectName))

    await analyzeRepo(tempDir, ignoreTrueProjectName, {
      batchSize: 2000,
      force: true,
      incremental: false,
    })

    const projectRows = await db.select().from(projects).where(eq(projects.name, ignoreTrueProjectName))
    const projectId = projectRows[0]!.id

    const commitRows = await db.select().from(commits).where(eq(commits.projectId, projectId))
    expect(commitRows).toHaveLength(1)

    // With ignore=true (default), files matching *.log should be filtered out
    const fileRows = await db.select().from(commit_files).where(eq(commit_files.commitId, commitRows[0]!.id))
    const filePaths = fileRows.map(f => f.path)
    expect(filePaths).toContain('main.ts')
    expect(filePaths).not.toContain('debug.log')

    await db.delete(projects).where(eq(projects.name, ignoreTrueProjectName))
  })
})

describe('analyzeRepo path normalization', () => {
  const hasDb = !!process.env.DATABASE_URL
  const cleanupProjects: string[] = []
  const cleanupDirs: string[] = []

  afterAll(async () => {
    if (!hasDb)
      return
    for (const name of cleanupProjects) {
      await db.delete(projects).where(eq(projects.name, name))
    }
    await pool.end()
    for (const dir of cleanupDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      }
      catch {
        // ignore cleanup failures
      }
    }
  })

  it.skipIf(!hasDb)('stores absolute path when given relative path "."', { timeout: 30000 }, async () => {
    const tempDir = mkdtempSync(`${tmpdir()}/river-pathnorm-test-`)
    cleanupDirs.push(tempDir)
    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test"', { cwd: tempDir })
    execSync('git config user.email "test@test.com"', { cwd: tempDir })
    writeFileSync(`${tempDir}/test.txt`, 'hello\n')
    execSync('git add .', { cwd: tempDir })
    execSync('git commit -m "init"', { cwd: tempDir })

    const projectName = 'pathnorm-dot-relative'
    cleanupProjects.push(projectName)

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
    expect(storedPath).not.toBe('.')
    expect(storedPath).toBe(tempDir)
  })

  it.skipIf(!hasDb)('resolves symlink to real path', { timeout: 30000 }, async () => {
    const realDir = mkdtempSync(`${tmpdir()}/river-real-test-`)
    const symlinkDir = `${tmpdir()}/river-symlink-test-`
    cleanupDirs.push(realDir, symlinkDir)

    execSync('git init', { cwd: realDir })
    execSync('git config user.name "Test"', { cwd: realDir })
    execSync('git config user.email "test@test.com"', { cwd: realDir })
    writeFileSync(`${realDir}/test.txt`, 'hello\n')
    execSync('git add .', { cwd: realDir })
    execSync('git commit -m "init"', { cwd: realDir })

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
    expect(storedPath).toBe(realDir)
    expect(storedPath).not.toBe(symlinkDir)
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

  it.skipIf(!hasDb)('strips trailing slashes', { timeout: 30000 }, async () => {
    const tempDir = mkdtempSync(`${tmpdir()}/river-slash-test-`)
    cleanupDirs.push(tempDir)
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
    expect(storedPath).not.toMatch(/\/$/)
    expect(storedPath).toBe(tempDir)
  })
})
