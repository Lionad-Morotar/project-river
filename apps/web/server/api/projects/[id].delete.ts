import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  // Check existence first to return proper 404
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (existing.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // ON DELETE CASCADE on commits/commit_files/daily_stats handles related data
  await db.delete(projects).where(eq(projects.id, projectId))

  return { success: true, id: projectId }
})
