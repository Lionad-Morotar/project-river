import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { reanalyzeProject } from '../../../utils/importProject'

const reanalyzeBodySchema = z.object({
  force: z.boolean().default(false),
}).default({})

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  // Verify project exists and has enough info for re-analysis
  const rows = await db
    .select({
      id: projects.id,
      fullName: projects.fullName,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const project = rows[0]!

  if (!project.fullName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project does not have a GitHub fullName. It may have been created via CLI and cannot be re-analyzed through this endpoint.',
    })
  }

  // If already in progress, return current status
  if (project.status === 'cloning' || project.status === 'analyzing') {
    return { id: project.id, status: project.status }
  }

  // Parse options
  const body = await readBody(event)
  const parsed = reanalyzeBodySchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid request body: ${parsed.error.message}`,
    })
  }

  const { force } = parsed.data

  // Parse owner/repo from fullName
  const [owner, repo] = project.fullName.split('/')
  if (!owner || !repo) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project fullName is malformed. Expected "owner/repo" format.',
    })
  }

  // Reset status to cloning
  await db
    .update(projects)
    .set({ status: 'cloning', errorMessage: null })
    .where(eq(projects.id, projectId))

  // Fire-and-forget the re-analysis
  reanalyzeProject(projectId, owner, repo, { force }).catch((err: unknown) => {
    console.error(`[reanalyze.post] Unhandled re-analyze error for project ${projectId}:`, err)
  })

  return { id: projectId, status: 'cloning' }
})
