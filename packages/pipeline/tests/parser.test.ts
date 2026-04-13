import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { parseLogStream, parseRepo } from '../src/parser.ts'

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of gen) {
    results.push(item)
  }
  return results
}

describe('parseLogStream', () => {
  it('basic parsing yields 2 commits with correct fields and files', async () => {
    async function* lines(): AsyncGenerator<string> {
      yield 'abc1230000000000000000000000000000000000\tAlice\talice@example.com\t2026-04-01T10:00:00Z\tfeat: add foo\tbar'
      yield '10\t2\tsrc/a.ts'
      yield '5\t1\tsrc/b.ts'
      yield ''
      yield 'def4560000000000000000000000000000000000\tBob\tbob@example.com\t2026-04-02T12:00:00Z\tfix: bug'
      yield '3\t0\tsrc/a.ts'
      yield ''
    }

    const commits = await collect(parseLogStream(lines()))
    expect(commits).toHaveLength(2)

    const [first, second] = commits
    expect(first.hash).toBe('abc1230000000000000000000000000000000000')
    expect(first.authorName).toBe('Alice')
    expect(first.authorEmail).toBe('alice@example.com')
    expect(first.committerDate).toEqual(new Date('2026-04-01T10:00:00Z'))
    expect(first.message).toBe('feat: add foo\tbar')
    expect(first.files).toHaveLength(2)
    expect(first.files[0]).toEqual({ path: 'src/a.ts', insertions: 10, deletions: 2 })
    expect(first.files[1]).toEqual({ path: 'src/b.ts', insertions: 5, deletions: 1 })

    expect(second.hash).toBe('def4560000000000000000000000000000000000')
    expect(second.authorName).toBe('Bob')
    expect(second.files).toHaveLength(1)
    expect(second.files[0]).toEqual({ path: 'src/a.ts', insertions: 3, deletions: 0 })
  })

  it('binary file handling maps - to 0 insertions and deletions', async () => {
    async function* lines(): AsyncGenerator<string> {
      yield 'beef000000000000000000000000000000000000\tDev\tdev@example.com\t2026-04-03T08:00:00Z\tadd binary'
      yield '-\t-\tbinary.bin'
      yield ''
    }

    const commits = await collect(parseLogStream(lines()))
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toHaveLength(1)
    expect(commits[0].files[0]).toEqual({ path: 'binary.bin', insertions: 0, deletions: 0 })
  })

  it('empty commit yields commit with files: []', async () => {
    async function* lines(): AsyncGenerator<string> {
      yield 'dead000000000000000000000000000000000000\tDev\tdev@example.com\t2026-04-04T09:00:00Z\tempty'
      yield ''
    }

    const commits = await collect(parseLogStream(lines()))
    expect(commits).toHaveLength(1)
    expect(commits[0].files).toEqual([])
  })
})

describe('parseRepo integration', () => {
  it('resolves mailmap and returns canonical authorEmail', async () => {
    const tempDir = mkdtempSync(`${tmpdir()}/river-pipeline-test-`)

    execSync('git init', { cwd: tempDir })
    execSync('git config user.name "Test"', { cwd: tempDir })
    execSync('git config user.email "old@example.com"', { cwd: tempDir })
    writeFileSync(`${tempDir}/file.txt`, 'hello')
    execSync('git add .', { cwd: tempDir })
    execSync('git commit -m "init"', { cwd: tempDir })

    writeFileSync(`${tempDir}/.mailmap`, 'Canonical User <canonical@example.com> <old@example.com>')
    execSync('git add .mailmap', { cwd: tempDir })
    execSync('git commit -m "add mailmap"', { cwd: tempDir })

    const commits = await collect(parseRepo(tempDir))
    const initCommit = commits.find(c => c.message === 'init')
    expect(initCommit).toBeDefined()
    expect(initCommit!.authorEmail).toBe('canonical@example.com')
  })

  it('throws on invalid repo path', async () => {
    await expect(collect(parseRepo('/nonexistent/path/xyz'))).rejects.toThrow('git log exited')
  })
})
