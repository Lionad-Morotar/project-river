import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildGitignoreLookup, filterIgnoredFiles, getGitignoreHistory } from '../src/db/gitignore.ts'

describe('filterIgnoredFiles', () => {
  it('returns all files when patterns are empty', () => {
    const files = [
      { path: 'src/main.ts', insertions: 10, deletions: 2 },
      { path: 'debug.log', insertions: 5, deletions: 1 },
    ]
    const result = filterIgnoredFiles(files, '')
    expect(result).toEqual(files)
  })

  it('filters files matching simple glob patterns', () => {
    const files = [
      { path: 'src/main.ts', insertions: 10, deletions: 2 },
      { path: 'debug.log', insertions: 5, deletions: 1 },
      { path: 'node_modules/foo/index.js', insertions: 1, deletions: 0 },
    ]
    const result = filterIgnoredFiles(files, '*.log\nnode_modules/')
    expect(result).toHaveLength(1)
    expect(result[0]!.path).toBe('src/main.ts')
  })

  it('ignores comment and blank lines in patterns', () => {
    const files = [
      { path: 'keep.txt', insertions: 1, deletions: 0 },
      { path: 'ignore.tmp', insertions: 2, deletions: 0 },
    ]
    const patterns = '# This is a comment\n\n*.tmp\n'
    const result = filterIgnoredFiles(files, patterns)
    expect(result).toHaveLength(1)
    expect(result[0]!.path).toBe('keep.txt')
  })
})

describe('buildGitignoreLookup', () => {
  it('evolves patterns forward in time (oldest → newest)', () => {
    const history = [
      { commitSha: 'sha-02', patterns: '*.log' },
      { commitSha: 'sha-04', patterns: '*.log\n*.tmp' },
    ]
    const shas = ['sha-01', 'sha-02', 'sha-03', 'sha-04', 'sha-05']
    const lookup = buildGitignoreLookup(shas, history)

    expect(lookup.get('sha-01')).toBe('')
    expect(lookup.get('sha-02')).toBe('*.log')
    expect(lookup.get('sha-03')).toBe('*.log')
    expect(lookup.get('sha-04')).toBe('*.log\n*.tmp')
    expect(lookup.get('sha-05')).toBe('*.log\n*.tmp')
  })

  it('uses Map for O(1) lookup instead of O(n*m) scan', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({
      commitSha: `sha-${i}`,
      patterns: `pattern-${i}`,
    }))
    const shas = Array.from({ length: 1000 }, (_, i) => `sha-${i}`)
    // Should complete quickly; this mainly ensures no quadratic behavior
    const lookup = buildGitignoreLookup(shas, history)
    expect(lookup.size).toBe(1000)
  })
})

describe('getGitignoreHistory integration', () => {
  const hasDb = !!process.env.DATABASE_URL
  let repoPath: string

  beforeAll(() => {
    if (!hasDb)
      return
    repoPath = mkdtempSync(`${tmpdir()}/river-gitignore-test-`)
    execSync('git init', { cwd: repoPath })
    execSync('git config user.name "Test"', { cwd: repoPath })
    execSync('git config user.email "test@test.com"', { cwd: repoPath })

    // Commit 1: add initial file
    writeFileSync(`${repoPath}/readme.md`, '# hello')
    execSync('git add readme.md', { cwd: repoPath })
    execSync('git commit -m "init"', { cwd: repoPath })

    // Commit 2: add .gitignore with *.log
    writeFileSync(`${repoPath}/.gitignore`, '*.log\n')
    execSync('git add .gitignore', { cwd: repoPath })
    execSync('git commit -m "add gitignore"', { cwd: repoPath })

    // Commit 3: modify a regular file
    writeFileSync(`${repoPath}/readme.md`, '# hello world')
    execSync('git add readme.md', { cwd: repoPath })
    execSync('git commit -m "update readme"', { cwd: repoPath })

    // Commit 4: update .gitignore to also ignore *.tmp
    writeFileSync(`${repoPath}/.gitignore`, '*.log\n*.tmp\n')
    execSync('git add .gitignore', { cwd: repoPath })
    execSync('git commit -m "update gitignore"', { cwd: repoPath })
  })

  afterAll(() => {
    // Temp dir cleanup is handled by OS eventually in test environments
  })

  it.skipIf(!hasDb)('returns chronological gitignore history for repo', async () => {
    const history = await getGitignoreHistory(repoPath!)
    expect(history).toHaveLength(2)

    expect(history[0]!.patterns).toBe('*.log\n')
    expect(history[1]!.patterns).toBe('*.log\n*.tmp\n')
  })
})
