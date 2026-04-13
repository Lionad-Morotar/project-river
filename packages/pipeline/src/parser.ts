import type { ParsedCommit } from './types.ts'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const HEADER_RE = /^[a-f0-9]{40}\t/

function isHeaderLine(line: string): boolean {
  // Header lines start with a 40-char hex SHA followed by tab
  return HEADER_RE.test(line)
}

export async function* parseRepo(repoPath: string): AsyncGenerator<ParsedCommit> {
  const cp = spawn('git', [
    '-C',
    repoPath,
    'log',
    '--no-merges',
    '--date=iso-strict',
    '--format=%H\t%aN\t%aE\t%cd\t%s',
    '--numstat',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  let current: ParsedCommit | null = null

  for await (const line of createInterface({ input: cp.stdout })) {
    if (line.trim() === '') {
      continue
    }

    if (isHeaderLine(line)) {
      if (current) {
        yield current
      }
      const [hash, authorName, authorEmail, dateStr, ...messageParts] = line.split('\t')
      current = {
        hash,
        authorName,
        authorEmail,
        committerDate: new Date(dateStr),
        message: messageParts.join('\t'),
        files: [],
      }
      continue
    }

    if (current) {
      const [insertionsStr, deletionsStr, path] = line.split('\t')
      if (!path) {
        continue // malformed numstat line
      }
      const insertions = insertionsStr === '-' ? 0 : Number(insertionsStr)
      const deletions = deletionsStr === '-' ? 0 : Number(deletionsStr)
      current.files.push({ path, insertions, deletions })
    }
  }

  if (current) {
    yield current
  }

  const exitCode = await new Promise<number | null>(resolve => cp.on('close', resolve))
  if (exitCode !== 0) {
    throw new Error(`git log exited with code ${exitCode}`)
  }
}

export async function* parseLogStream(lines: AsyncIterable<string>): AsyncGenerator<ParsedCommit> {
  let current: ParsedCommit | null = null

  for await (const line of lines) {
    if (line.trim() === '') {
      continue
    }

    if (isHeaderLine(line)) {
      if (current) {
        yield current
      }
      const [hash, authorName, authorEmail, dateStr, ...messageParts] = line.split('\t')
      current = {
        hash,
        authorName,
        authorEmail,
        committerDate: new Date(dateStr),
        message: messageParts.join('\t'),
        files: [],
      }
      continue
    }

    if (current) {
      const [insertionsStr, deletionsStr, path] = line.split('\t')
      if (!path) {
        continue
      }
      const insertions = insertionsStr === '-' ? 0 : Number(insertionsStr)
      const deletions = deletionsStr === '-' ? 0 : Number(deletionsStr)
      current.files.push({ path, insertions, deletions })
    }
  }

  if (current) {
    yield current
  }
}
