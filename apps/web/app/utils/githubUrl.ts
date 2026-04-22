export type InputType = 'github' | 'local-path'

export function detectInputType(input: string): InputType | null {
  const t = input.trim()
  if (!t)
    return null
  // Unix 绝对路径、~ 路径、相对路径（以 ./ 或 ../ 开头）
  if (/^[/~.]/.test(t) && !t.startsWith('http'))
    return 'local-path'
  // Windows 盘符路径 C:\ D:\
  if (/^[A-Z]:[\\/]/i.test(t))
    return 'local-path'
  // 多段路径（不含 : 和 github.com）视为本地路径
  const slashes = (t.match(/\//g) || []).length
  if (slashes > 1 && !t.includes(':') && !t.includes('github.com'))
    return 'local-path'
  return null // 交给 GitHub 解析器
}

export interface ParsedLocalPath {
  path: string
}

export interface ParseError {
  error: string
}

/** 前端轻量校验，实际路径存在性由服务端验证 */
export function parseLocalPath(input: string): ParsedLocalPath | ParseError {
  const t = input.trim()
  if (!t)
    return { error: 'Path is empty' }
  if (t.length > 4096)
    return { error: 'Path is too long (max 4096 characters)' }
  if (t.includes('\0'))
    return { error: 'Path contains null bytes' }
  return { path: t }
}

export interface ParsedGitHubUrl {
  owner: string
  repo: string
}

export type ParseResult = ParsedGitHubUrl | ParseError

const GITHUB_OWNER_REPO_RE = /^[\w.-]+$/

export function isValidOwnerRepo(owner: string, repo: string): boolean {
  return GITHUB_OWNER_REPO_RE.test(owner) && GITHUB_OWNER_REPO_RE.test(repo)
}

export function parseGitHubUrl(input: string): ParseResult {
  const trimmed = input.trim()

  if (!trimmed) {
    return { error: 'Input is empty' }
  }

  // SSH format: git@github.com:owner/repo[.git]
  const sshMatch = trimmed.match(
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  )
  if (sshMatch) {
    const owner = sshMatch[1]
    const repo = sshMatch[2]
    if (!owner || !repo)
      return { error: 'Invalid SSH format' }
    return { owner, repo }
  }

  // owner/repo shorthand: exactly one slash, no colon (not SSH), no ://
  // Must check before URL parsing so repo names with dots (e.g. "my.repo") work
  const slashCount = (trimmed.match(/\//g) || []).length
  if (slashCount === 1 && !trimmed.includes(':')) {
    const [owner, repo] = trimmed.split('/')
    if (!owner || !repo) {
      return { error: 'Invalid format: expected "owner/repo"' }
    }
    return { owner, repo: repo.replace(/\.git$/, '') }
  }

  // Full URL format (HTTPS or scheme-less github.com/...)
  let url: URL
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      url = new URL(trimmed)
    }
    else if (trimmed.includes('github.com')) {
      // github.com/owner/repo without protocol
      url = new URL(`https://${trimmed}`)
    }
    else {
      return { error: 'Not a GitHub URL' }
    }
  }
  catch {
    return { error: 'Invalid URL format' }
  }

  if (url.hostname !== 'github.com') {
    return { error: 'Not a GitHub URL. Only github.com URLs are supported.' }
  }

  // Extract owner/repo from pathname
  const parts = url.pathname.split('/').filter(Boolean) // remove empty strings

  if (parts.length < 2) {
    return { error: 'GitHub URL must include owner and repository name' }
  }

  const owner = parts[0]!
  let repo = parts[1]!

  // Strip .git suffix
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4)
  }

  return { owner, repo }
}

export function normalizeGitHubUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`
}
