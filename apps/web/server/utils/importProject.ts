import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdir, realpath, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { analyzeRepo } from '@project-river/pipeline'
import { eq } from 'drizzle-orm'
import { isValidOwnerRepo } from '../../app/utils/githubUrl'

const REPOS_DIR = join(homedir(), '.project-river', 'repos')
const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

/** 获取仓库的 HEAD commit full hash */
export function extractHeadHash(repoPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cp = spawn('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let stdout = ''
    cp.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    cp.on('error', () => resolve(null))
    cp.on('close', (code) => {
      if (code === 0) {
        const hash = stdout.trim()
        resolve(/^[a-f0-9]{40}$/.test(hash) ? hash : null)
      }
      else {
        resolve(null)
      }
    })
  })
}

/**
 * Classify gh clone errors into user-friendly error messages with error class prefixes.
 */
function classifyCloneError(exitCode: number | null, stderr: string): string {
  if (exitCode === null) {
    return `CLONE_FAILED: gh process was terminated (${stderr.slice(0, 200)})`
  }

  const lower = stderr.toLowerCase()

  if (lower.includes('not found') || lower.includes('could not resolve')) {
    return `GH_NOT_FOUND: Repository not found (${stderr.slice(0, 200)})`
  }
  if (lower.includes('not authenticated') || lower.includes('credentials') || lower.includes('authentication')) {
    return `GH_AUTH: gh CLI not authenticated (${stderr.slice(0, 200)})`
  }
  if (lower.includes('private') || lower.includes('403') || lower.includes('forbidden')) {
    return `GH_PRIVATE: Private repository or access denied (${stderr.slice(0, 200)})`
  }

  return `CLONE_FAILED: gh repo clone exited with code ${exitCode} (${stderr.slice(0, 200)})`
}

/**
 * Resolve projectId to the actual project row, handling the case where
 * analyzeRepo may have deleted and re-created the record (force mode).
 * Falls back to finding by fullName.
 */
async function resolveProjectId(projectId: number, fullName: string): Promise<number> {
  // Check if original projectId still exists
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (existing.length > 0) {
    return projectId
  }

  // analyzeRepo deleted the original record — find the new one by fullName
  const byName = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.fullName, fullName))
    .limit(1)

  if (byName.length > 0) {
    return byName[0]!.id
  }

  // Should not happen, but return original if nothing found
  return projectId
}

/**
 * Core import logic: clone a GitHub repo via gh CLI, then run pipeline analysis.
 *
 * This function is designed to be called fire-and-forget from an API handler.
 * It manages project status transitions throughout the import lifecycle.
 *
 * @param projectId - The database project record ID
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 */
export async function importProject(
  projectId: number,
  owner: string,
  repo: string,
): Promise<void> {
  const fullName = `${owner}/${repo}`

  // AbortController for the entire import lifecycle (10 min timeout)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS)

  try {
    // Validate owner/repo format to prevent command injection
    if (!isValidOwnerRepo(owner, repo)) {
      await updateProjectError(projectId, 'GH_NOT_FOUND: Invalid owner or repository name format')
      return
    }

    // Ensure repos base directory exists
    await mkdir(REPOS_DIR, { recursive: true })

    const cloneDir = join(REPOS_DIR, `${owner}--${repo}`)

    // --- Phase 1: Clone ---
    await updateProjectStatus(projectId, 'cloning')

    try {
      await cloneRepo(owner, repo, cloneDir, controller.signal)
    }
    catch (err: unknown) {
      if (controller.signal.aborted) {
        await updateProjectError(projectId, 'ANALYSIS_TIMEOUT: Clone or analysis exceeded 10 minutes')
        return
      }

      if (err instanceof Error && err.message.startsWith('GH_NOT_INSTALLED')) {
        await updateProjectError(projectId, err.message)
        return
      }

      const message = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, message)
      return
    }

    // --- Phase 2: Analyze ---
    await updateProjectStatus(projectId, 'analyzing')

    try {
      const realPath = await realpath(cloneDir)

      // Set the resolved path so analyzeRepo can find this record by path
      await db
        .update(projects)
        .set({ path: realPath })
        .where(eq(projects.id, projectId))

      await analyzeRepo(realPath, repo, {
        batchSize: 500,
        force: true,
        incremental: false,
      })

      // analyzeRepo may have deleted and re-created the project record in force mode.
      // Resolve the actual projectId after analysis.
      const actualId = await resolveProjectId(projectId, fullName)

      // Mark as ready with metadata
      const headHash = await extractHeadHash(realPath)
      await db
        .update(projects)
        .set({
          fullName,
          url: `https://github.com/${owner}/${repo}`,
          status: 'ready',
          lastAnalyzedAt: new Date(),
          errorMessage: null,
          headCommitHash: headHash,
        })
        .where(eq(projects.id, actualId))
    }
    catch (err: unknown) {
      if (controller.signal.aborted) {
        await updateProjectError(projectId, 'ANALYSIS_TIMEOUT: Clone or analysis exceeded 10 minutes')
        return
      }

      const detail = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, `ANALYSIS_FAILED: ${detail}`)
    }
  }
  catch (err: unknown) {
    // Catch-all for unexpected errors (e.g. DB connection failures during status updates)
    try {
      const detail = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, `ANALYSIS_FAILED: Unexpected error during import — ${detail}`)
    }
    catch {
      // If even the error update fails, there's nothing more we can do
      console.error(`[importProject] Fatal error for project ${projectId}:`, err)
    }
  }
  finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Clone a GitHub repository using the gh CLI.
 */
function cloneRepo(
  owner: string,
  repo: string,
  targetDir: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cp = spawn('gh', ['repo', 'clone', `${owner}/${repo}`, targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    })

    let stderr = ''

    cp.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    cp.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('GH_NOT_INSTALLED: gh CLI not found on PATH'))
        return
      }
      reject(new Error(classifyCloneError(null, stderr || err.message)))
    })

    cp.on('close', (code: number | null) => {
      if (code === 0) {
        resolve()
      }
      else {
        reject(new Error(classifyCloneError(code, stderr)))
      }
    })
  })
}

/**
 * Re-analyze an existing project. Supports incremental and force modes.
 *
 * For incremental mode, the repo directory must already exist from a previous clone.
 * For force mode, the repo is re-cloned if the directory exists or cloned fresh.
 */
export async function reanalyzeProject(
  projectId: number,
  owner: string,
  repo: string,
  options: { force: boolean },
): Promise<void> {
  const fullName = `${owner}/${repo}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS)

  try {
    if (!isValidOwnerRepo(owner, repo)) {
      await updateProjectError(projectId, 'GH_NOT_FOUND: Invalid owner or repository name format')
      return
    }

    const cloneDir = join(REPOS_DIR, `${owner}--${repo}`)

    // --- Phase 1: Ensure clone exists ---
    if (options.force) {
      await updateProjectStatus(projectId, 'cloning')

      // Remove existing clone for fresh start
      try {
        await rm(cloneDir, { recursive: true, force: true })
      }
      catch {
        // Directory may not exist, that's fine
      }

      await mkdir(REPOS_DIR, { recursive: true })

      try {
        await cloneRepo(owner, repo, cloneDir, controller.signal)
      }
      catch (err: unknown) {
        if (controller.signal.aborted) {
          await updateProjectError(projectId, 'ANALYSIS_TIMEOUT: Clone or analysis exceeded 10 minutes')
          return
        }
        if (err instanceof Error && err.message.startsWith('GH_NOT_INSTALLED')) {
          await updateProjectError(projectId, err.message)
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        await updateProjectError(projectId, message)
        return
      }
    }

    // --- Phase 2: Analyze ---
    await updateProjectStatus(projectId, 'analyzing')

    try {
      const realPath = await realpath(cloneDir)

      // Ensure path is set so analyzeRepo can find this record
      await db
        .update(projects)
        .set({ path: realPath })
        .where(eq(projects.id, projectId))

      await analyzeRepo(realPath, repo, {
        batchSize: 500,
        force: options.force,
        incremental: !options.force,
      })

      const actualId = await resolveProjectId(projectId, fullName)

      const headHash = await extractHeadHash(realPath)
      await db
        .update(projects)
        .set({
          fullName,
          url: `https://github.com/${owner}/${repo}`,
          status: 'ready',
          lastAnalyzedAt: new Date(),
          errorMessage: null,
          headCommitHash: headHash,
        })
        .where(eq(projects.id, actualId))
    }
    catch (err: unknown) {
      if (controller.signal.aborted) {
        await updateProjectError(projectId, 'ANALYSIS_TIMEOUT: Clone or analysis exceeded 10 minutes')
        return
      }
      const detail = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, `ANALYSIS_FAILED: ${detail}`)
    }
  }
  catch (err: unknown) {
    try {
      const detail = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, `ANALYSIS_FAILED: Unexpected error during re-analyze — ${detail}`)
    }
    catch {
      console.error(`[reanalyzeProject] Fatal error for project ${projectId}:`, err)
    }
  }
  finally {
    clearTimeout(timeoutId)
  }
}

// --- Helper functions ---

async function updateProjectStatus(projectId: number, status: string): Promise<void> {
  await db
    .update(projects)
    .set({ status })
    .where(eq(projects.id, projectId))
}

async function updateProjectError(projectId: number, errorMessage: string): Promise<void> {
  await db
    .update(projects)
    .set({ status: 'error', errorMessage })
    .where(eq(projects.id, projectId))
}

/**
 * 本地路径导入：跳过 Clone 阶段，直接分析本地 Git 仓库。
 * 结构与 importProject 相同，但无 Phase 1。
 */
export async function importLocalProject(
  projectId: number,
  resolvedPath: string,
): Promise<void> {
  const fullName = `local:${resolvedPath}`
  const name = basename(resolvedPath)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS)

  try {
    // --- Analyze（无 Clone 阶段）---
    await updateProjectStatus(projectId, 'analyzing')

    try {
      const realPath = await realpath(resolvedPath)

      // 确保路径已标准化
      await db
        .update(projects)
        .set({ path: realPath })
        .where(eq(projects.id, projectId))

      await analyzeRepo(realPath, name, {
        batchSize: 500,
        force: true,
        incremental: false,
      })

      const actualId = await resolveProjectId(projectId, fullName)

      const headHash = await extractHeadHash(realPath)
      await db
        .update(projects)
        .set({
          fullName,
          url: null,
          status: 'ready',
          lastAnalyzedAt: new Date(),
          errorMessage: null,
          headCommitHash: headHash,
        })
        .where(eq(projects.id, actualId))
    }
    catch (err: unknown) {
      if (controller.signal.aborted) {
        await updateProjectError(projectId, 'ANALYSIS_TIMEOUT: Analysis exceeded 10 minutes')
        return
      }
      const detail = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, `ANALYSIS_FAILED: ${detail}`)
    }
  }
  catch (err: unknown) {
    try {
      const detail = err instanceof Error ? err.message : String(err)
      await updateProjectError(projectId, `ANALYSIS_FAILED: Unexpected error during local import — ${detail}`)
    }
    catch {
      console.error(`[importLocalProject] Fatal error for project ${projectId}:`, err)
    }
  }
  finally {
    clearTimeout(timeoutId)
  }
}
