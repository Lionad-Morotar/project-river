import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { normalizeGitHubUrl, parseGitHubUrl } from '../../../app/utils/githubUrl'
import { importProject } from '../../utils/importProject'

const importBodySchema = z.object({
  url: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = importBodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must include a non-empty "url" field',
    })
  }

  const { url } = parsed.data

  // Parse and validate the GitHub URL
  const parseResult = parseGitHubUrl(url)
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
    })
    .from(projects)
    .where(eq(projects.fullName, fullName))
    .limit(1)

  if (existing.length > 0) {
    const project = existing[0]!

    // If already ready, return the existing project (no re-import)
    if (project.status === 'ready') {
      return { id: project.id, status: 'ready', fullName }
    }

    // If currently in progress (cloning/analyzing), return the in-progress status
    if (project.status === 'cloning' || project.status === 'analyzing') {
      return { id: project.id, status: project.status, fullName }
    }

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
