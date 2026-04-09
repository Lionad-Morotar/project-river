import { spawn } from 'node:child_process'
import ignore from 'ignore'

interface GitignoreVersion {
  commitSha: string
  patterns: string
}

/**
 * Get the chronological history of .gitignore changes in a repo.
 * Returns an array of { commitSha, patterns } sorted oldest to newest.
 * Only includes commits where .gitignore file actually changed.
 */
export async function getGitignoreHistory(repoPath: string): Promise<GitignoreVersion[]> {
  const logResult = await runGit(repoPath, [
    'log',
    '--format=%H',
    '--diff-filter=ACDMR',
    '--',
    '.gitignore',
  ])

  if (!logResult.trim()) {
    return []
  }

  const shas = logResult.trim().split('\n').reverse() // oldest first
  const history: GitignoreVersion[] = []

  for (const sha of shas) {
    try {
      const content = await runGit(repoPath, ['show', `${sha}:.gitignore`])
      history.push({ commitSha: sha, patterns: content })
    }
    catch {
      // .gitignore might have been deleted in this commit
    }
  }

  return history
}

/**
 * Filter file paths using gitignore patterns.
 * Returns only files that are NOT ignored.
 */
export function filterIgnoredFiles(
  files: { path: string, insertions: number, deletions: number }[],
  patterns: string,
): { path: string, insertions: number, deletions: number }[] {
  if (!patterns.trim()) {
    return files
  }

  const ig = ignore().add(patterns)
  return files.filter(f => !ig.ignores(f.path))
}

/**
 * Build a lookup that maps each commit SHA to its applicable .gitignore patterns.
 * Uses the gitignore history to determine which rules were active at each commit.
 */
export function buildGitignoreLookup(
  allCommitShas: string[],
  gitignoreHistory: GitignoreVersion[],
): Map<string, string> {
  const lookup = new Map<string, string>()
  let currentPatterns = ''

  for (const sha of allCommitShas) {
    const version = gitignoreHistory.find(v => v.commitSha === sha)
    if (version) {
      currentPatterns = version.patterns
    }
    lookup.set(sha, currentPatterns)
  }

  return lookup
}

function runGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const cp = spawn('git', ['-C', repoPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    cp.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    cp.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    cp.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      }
      else {
        reject(new Error(`git ${args.join(' ')} failed: ${stderr}`))
      }
    })
  })
}
