import { existsSync } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { normalizeGitHubUrl, parseGitHubUrl } from '../../../app/utils/githubUrl'
import { extractHeadHash, importLocalProject, importProject } from '../../utils/importProject'

const importBodySchema = z.object({
  url: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
}).refine(d => d.url || d.path, { message: 'Request body must include a non-empty "url" or "path" field' })

/** 系统目录黑名单，禁止导入 */
const BLOCKED_PREFIXES = ['/proc', '/sys', '/dev', '/etc', '/System', '/Library/System']

/** 本地克隆仓库目录（与 importProject.ts 一致） */
const REPOS_DIR = join(homedir(), '.project-river', 'repos')

/** 展开 ~ 并标准化路径 */
function resolveLocalPath(inputPath: string): string {
  const expanded = inputPath.replace(/^~/, homedir())
  return resolve(expanded)
}

/** 验证本地路径：存在性、Git 仓库、读权限 */
async function validateLocalPath(resolvedPath: string): Promise<string | null> {
  // 黑名单检查
  for (const prefix of BLOCKED_PREFIXES) {
    if (resolvedPath.startsWith(prefix)) {
      return `PATH_INVALID: System directory "${prefix}" is not allowed`
    }
  }

  // 路径存在性
  if (!existsSync(resolvedPath)) {
    return `PATH_NOT_FOUND: "${resolvedPath}" does not exist`
  }

  // .git 目录存在
  if (!existsSync(`${resolvedPath}/.git`)) {
    return `PATH_NOT_GIT_REPO: "${resolvedPath}" is not a Git repository`
  }

  // 读权限
  try {
    await access(resolvedPath, constants.R_OK)
  }
  catch {
    return `PATH_PERMISSION_DENIED: Cannot read "${resolvedPath}"`
  }

  return null
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = importBodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must include a non-empty "url" or "path" field',
    })
  }

  const { url, path } = parsed.data

  // --- 本地路径导入分支 ---
  if (path) {
    const resolvedPath = resolveLocalPath(path)

    // 服务端验证
    const validationError = await validateLocalPath(resolvedPath)
    if (validationError) {
      throw createError({ statusCode: 400, statusMessage: validationError })
    }

    const fullName = `local:${resolvedPath}`
    const name = basename(resolvedPath)

    // 去重检查
    const existing = await db
      .select({ id: projects.id, status: projects.status, headCommitHash: projects.headCommitHash })
      .from(projects)
      .where(eq(projects.fullName, fullName))
      .limit(1)

    if (existing.length > 0) {
      const project = existing[0]!
      if (project.status === 'cloning' || project.status === 'analyzing') {
        return { id: project.id, status: project.status, fullName }
      }

      if (project.status === 'ready') {
        // 比较 HEAD hash 决定缓存命中还是重新分析
        const currentHash = await extractHeadHash(resolvedPath)
        if (currentHash && project.headCommitHash === currentHash) {
          return { id: project.id, status: 'ready', fullName }
        }
        // HEAD 有变化，触发重新分析
        await db
          .update(projects)
          .set({ status: 'analyzing', errorMessage: null })
          .where(eq(projects.id, project.id))

        importLocalProject(project.id, resolvedPath).catch((err: unknown) => {
          console.error(`[import.post] Unhandled local import error for project ${project.id}:`, err)
        })
        return { id: project.id, status: 'analyzing', fullName }
      }

      // error 状态，允许重试
      await db
        .update(projects)
        .set({ status: 'analyzing', errorMessage: null })
        .where(eq(projects.id, project.id))

      importLocalProject(project.id, resolvedPath).catch((err: unknown) => {
        console.error(`[import.post] Unhandled local import error for project ${project.id}:`, err)
      })
      return { id: project.id, status: 'analyzing', fullName }
    }

    // 创建新记录
    let insertedId: number
    try {
      const inserted = await db
        .insert(projects)
        .values({
          name,
          path: resolvedPath,
          fullName,
          url: null,
          status: 'analyzing',
        })
        .returning({ id: projects.id })
      insertedId = inserted[0]!.id
    }
    catch (err: unknown) {
      if ((err instanceof Error && err.message.includes('unique')) || (err as { code?: string }).code === '23505') {
        const raceExisting = await db
          .select({ id: projects.id, status: projects.status })
          .from(projects)
          .where(eq(projects.fullName, fullName))
          .limit(1)
        if (raceExisting.length > 0) {
          return { id: raceExisting[0]!.id, status: raceExisting[0]!.status, fullName }
        }
      }
      throw err
    }

    importLocalProject(insertedId, resolvedPath).catch((err: unknown) => {
      console.error(`[import.post] Unhandled local import error for project ${insertedId}:`, err)
    })

    return { id: insertedId, status: 'analyzing', fullName }
  }

  // --- GitHub URL 导入（原有逻辑） ---
  const parseResult = parseGitHubUrl(url!)
  if ('error' in parseResult) {
    throw createError({
      statusCode: 400,
      statusMessage: parseResult.error,
    })
  }

  const { owner, repo } = parseResult
  const fullName = `${owner}/${repo}`

  // Check for existing project with the same fullName
  const existing = await db
    .select({
      id: projects.id,
      status: projects.status,
      headCommitHash: projects.headCommitHash,
    })
    .from(projects)
    .where(eq(projects.fullName, fullName))
    .limit(1)

  if (existing.length > 0) {
    const project = existing[0]!

    // If currently in progress (cloning/analyzing), return the in-progress status
    if (project.status === 'cloning' || project.status === 'analyzing') {
      return { id: project.id, status: project.status, fullName }
    }

    // If already ready, compare HEAD hash to detect new commits
    if (project.status === 'ready') {
      const cloneDir = join(REPOS_DIR, `${owner}--${repo}`)
      const currentHash = await extractHeadHash(cloneDir)
      if (currentHash && project.headCommitHash === currentHash) {
        return { id: project.id, status: 'ready', fullName }
      }
      // HEAD changed — re-import with fresh clone
      await db
        .update(projects)
        .set({ status: 'cloning', errorMessage: null })
        .where(eq(projects.id, project.id))

      importProject(project.id, owner, repo).catch((err: unknown) => {
        console.error(`[import.post] Unhandled import error for project ${project.id}:`, err)
      })

      return { id: project.id, status: 'cloning', fullName }
    }

    // If error status, allow re-import by updating existing record

    // If error status, allow re-import by updating existing record
    await db
      .update(projects)
      .set({ status: 'cloning', errorMessage: null })
      .where(eq(projects.id, project.id))

    // Fire-and-forget the import process
    importProject(project.id, owner, repo).catch((err: unknown) => {
      console.error(`[import.post] Unhandled import error for project ${project.id}:`, err)
    })

    return { id: project.id, status: 'cloning', fullName }
  }

  // Create new project record
  let insertedId: number
  try {
    const inserted = await db
      .insert(projects)
      .values({
        name: repo,
        path: '', // Will be set by importProject after clone
        fullName,
        url: normalizeGitHubUrl(owner, repo),
        status: 'cloning',
      })
      .returning({ id: projects.id })

    insertedId = inserted[0]!.id
  }
  catch (err: unknown) {
    // Handle unique constraint violation on fullName (race condition)
    if ((err instanceof Error && err.message.includes('unique')) || (err as { code?: string }).code === '23505') {
      const raceExisting = await db
        .select({ id: projects.id, status: projects.status })
        .from(projects)
        .where(eq(projects.fullName, fullName))
        .limit(1)

      if (raceExisting.length > 0) {
        return { id: raceExisting[0]!.id, status: raceExisting[0]!.status, fullName }
      }
    }
    throw err
  }

  // Fire-and-forget the import process
  importProject(insertedId, owner, repo).catch((err: unknown) => {
    console.error(`[import.post] Unhandled import error for project ${insertedId}:`, err)
  })

  return { id: insertedId, status: 'cloning', fullName }
})
