import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const rows = await db
    .select({
      status: projects.status,
      errorMessage: projects.errorMessage,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Prevent caching for status polling — always return fresh state
  event.node.res.setHeader('Cache-Control', 'no-store')

  return rows[0]
})
