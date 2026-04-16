import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'

export interface ProjectDetail {
  id: number
  name: string
  path: string
  url: string | null
  fullName: string | null
  status: string
  description: string | null
  lastAnalyzedAt: Date | null
  errorMessage: string | null
  createdAt: Date
}

export default defineEventHandler(async (event) => {
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const project = rows[0]!
  return project satisfies ProjectDetail
})
