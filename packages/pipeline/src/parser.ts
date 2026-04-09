import type { ParsedCommit } from './types.ts'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

function isHeaderLine(line: string): boolean {
  return line.split('\t').length >= 5
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

  yield* parseLogStream(createInterface({ input: cp.stdout }))

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
      const insertions = insertionsStr === '-' ? 0 : Number(insertionsStr)
      const deletions = deletionsStr === '-' ? 0 : Number(deletionsStr)
      current.files.push({ path, insertions, deletions })
    }
  }

  if (current) {
    yield current
  }
}
