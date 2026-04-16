import { describe, expect, it } from 'vitest'
import {
  isValidOwnerRepo,
  normalizeGitHubUrl,
  parseGitHubUrl,
} from '../../app/utils/githubUrl'

describe('parseGitHubUrl', () => {
  describe('hTTPS URLs', () => {
    it('parses standard HTTPS URL', () => {
      const result = parseGitHubUrl('https://github.com/facebook/react')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('strips .git suffix from HTTPS URL', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo.git')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('ignores path suffix like /tree/main', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/tree/main')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('ignores path suffix like /pull/123', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/pull/123')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('handles trailing slash', () => {
      const result = parseGitHubUrl('https://github.com/facebook/react/')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('handles URL with .git and trailing slash', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo.git/')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('handles URL with issues path', () => {
      const result = parseGitHubUrl('https://github.com/vuejs/core/issues/1000')
      expect(result).toEqual({ owner: 'vuejs', repo: 'core' })
    })
  })

  describe('owner/repo shorthand', () => {
    it('parses plain owner/repo', () => {
      const result = parseGitHubUrl('vuejs/core')
      expect(result).toEqual({ owner: 'vuejs', repo: 'core' })
    })

    it('parses owner/repo with hyphens and dots', () => {
      const result = parseGitHubUrl('my-org/my.repo-name')
      expect(result).toEqual({ owner: 'my-org', repo: 'my.repo-name' })
    })
  })

  describe('sSH format', () => {
    it('parses git@ SSH URL with .git', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo.git')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('parses git@ SSH URL without .git', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })
  })

  describe('scheme-less github.com URLs', () => {
    it('parses github.com/owner/repo without protocol', () => {
      const result = parseGitHubUrl('github.com/facebook/react')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })
  })

  describe('whitespace handling', () => {
    it('trims leading and trailing whitespace', () => {
      const result = parseGitHubUrl('  https://github.com/facebook/react  ')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })
  })

  describe('error paths', () => {
    it('rejects empty string', () => {
      const result = parseGitHubUrl('')
      expect(result).toEqual({ error: 'Input is empty' })
    })

    it('rejects whitespace-only string', () => {
      const result = parseGitHubUrl('   ')
      expect(result).toEqual({ error: 'Input is empty' })
    })

    it('rejects non-GitHub URL (GitLab)', () => {
      const result = parseGitHubUrl('https://gitlab.com/owner/repo')
      expect(result).toEqual({ error: 'Not a GitHub URL. Only github.com URLs are supported.' })
    })

    it('rejects random string', () => {
      const result = parseGitHubUrl('just-a-random-string')
      expect(result).toHaveProperty('error')
    })

    it('rejects GitHub URL without repo name', () => {
      const result = parseGitHubUrl('https://github.com/facebook')
      expect(result).toEqual({ error: 'GitHub URL must include owner and repository name' })
    })

    it('rejects GitHub homepage only', () => {
      const result = parseGitHubUrl('https://github.com')
      expect(result).toHaveProperty('error')
    })
  })
})

describe('normalizeGitHubUrl', () => {
  it('constructs standard HTTPS URL', () => {
    expect(normalizeGitHubUrl('facebook', 'react')).toBe(
      'https://github.com/facebook/react',
    )
  })

  it('handles owner/repo with special characters', () => {
    expect(normalizeGitHubUrl('my-org', 'my.repo')).toBe(
      'https://github.com/my-org/my.repo',
    )
  })
})

describe('isValidOwnerRepo', () => {
  it('accepts alphanumeric owner and repo', () => {
    expect(isValidOwnerRepo('facebook', 'react')).toBe(true)
  })

  it('accepts hyphens', () => {
    expect(isValidOwnerRepo('my-org', 'my-repo')).toBe(true)
  })

  it('accepts dots', () => {
    expect(isValidOwnerRepo('vuejs', 'core.js')).toBe(true)
  })

  it('accepts underscores', () => {
    expect(isValidOwnerRepo('my_org', 'my_repo')).toBe(true)
  })

  it('rejects spaces in owner', () => {
    expect(isValidOwnerRepo('my org', 'repo')).toBe(false)
  })

  it('rejects spaces in repo', () => {
    expect(isValidOwnerRepo('org', 'my repo')).toBe(false)
  })

  it('rejects shell metacharacters in owner', () => {
    expect(isValidOwnerRepo('org;rm -rf', 'repo')).toBe(false)
  })

  it('rejects shell metacharacters in repo', () => {
    expect(isValidOwnerRepo('org', 'repo$(whoami)')).toBe(false)
  })

  it('rejects path traversal in owner', () => {
    expect(isValidOwnerRepo('../etc', 'repo')).toBe(false)
  })

  it('rejects empty owner', () => {
    expect(isValidOwnerRepo('', 'repo')).toBe(false)
  })

  it('rejects empty repo', () => {
    expect(isValidOwnerRepo('org', '')).toBe(false)
  })
})
