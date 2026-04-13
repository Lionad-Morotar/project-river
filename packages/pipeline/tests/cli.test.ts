import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      { batchSize: 2000, force: false, ignore: true, incremental: false },
    )
  })

  it('calls analyzeRepo with explicit flags and project name', async () => {
    await runAnalyze([
      '/path/to/repo',
      'MyProject',
      '--force',
      '--batch-size',
      '500',
    ])
    expect(analyzeRepo).toHaveBeenCalledTimes(1)
    expect(analyzeRepo).toHaveBeenCalledWith(
      '/path/to/repo',
      'MyProject',
      { batchSize: 500, force: true, ignore: true, incremental: false },
    )
  })

  it('rejects --force with --incremental as mutually exclusive', async () => {
    await expect(runAnalyze(['/path/to/repo', '--force', '--incremental']))
      .rejects
      .toThrow('--force and --incremental are mutually exclusive')
  })

  it('rejects invalid batch size', async () => {
    await expect(runAnalyze(['/path/to/repo', '--batch-size', 'abc']))
      .rejects
      .toThrow('Invalid batch size')
    await expect(runAnalyze(['/path/to/repo', '--batch-size', '0']))
      .rejects
      .toThrow('Invalid batch size')
    await expect(runAnalyze(['/path/to/repo', '--batch-size', 'NaN']))
      .rejects
      .toThrow('Invalid batch size')
  })

  it('throws usage error when repo path is missing', async () => {
    await expect(runAnalyze([])).rejects.toThrow('Usage: analyze <repo-path> [project-name]')
  })

  it('passes ignore: false when --no-ignore is provided', async () => {
    await runAnalyze(['/path/to/repo', '--no-ignore'])
    expect(analyzeRepo).toHaveBeenCalledTimes(1)
    expect(analyzeRepo).toHaveBeenCalledWith(
      '/path/to/repo',
      undefined,
      { batchSize: 2000, force: false, ignore: false, incremental: false },
    )
  })
})
