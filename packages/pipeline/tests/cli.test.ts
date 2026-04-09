import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const analyzeRepo = vi.fn()

vi.doMock('../src/db/analyze.ts', () => ({
  analyzeRepo,
}))

const { runAnalyze } = await import('../src/cli.ts')

describe('runAnalyze', () => {
  beforeEach(() => {
    analyzeRepo.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls analyzeRepo with defaults when only repo path is provided', async () => {
    await runAnalyze(['/path/to/repo'])
    expect(analyzeRepo).toHaveBeenCalledTimes(1)
    expect(analyzeRepo).toHaveBeenCalledWith(
      '/path/to/repo',
      undefined,
      { batchSize: 2000, force: false, incremental: false },
    )
  })

  it('calls analyzeRepo with explicit flags and project name', async () => {
    await runAnalyze([
      '/path/to/repo',
      'MyProject',
      '--force',
      '--incremental',
      '--batch-size',
      '500',
    ])
    expect(analyzeRepo).toHaveBeenCalledTimes(1)
    expect(analyzeRepo).toHaveBeenCalledWith(
      '/path/to/repo',
      'MyProject',
      { batchSize: 500, force: true, incremental: true },
    )
  })

  it('throws usage error when repo path is missing', async () => {
    await expect(runAnalyze([])).rejects.toThrow('Usage: analyze <repo-path> [project-name]')
  })
})
