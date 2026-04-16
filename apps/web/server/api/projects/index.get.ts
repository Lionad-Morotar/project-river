import { db } from '@project-river/db/client'
import { projects } from '@project-river/db/schema'
import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'

export interface ProjectListItem {
  id: number
  name: string
  fullName: string | null
  status: string
  lastAnalyzedAt: Date | null
}

export default defineEventHandler(async () => {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      fullName: projects.fullName,
      status: projects.status,
      lastAnalyzedAt: projects.lastAnalyzedAt,
    })
    .from(projects)
    .orderBy(desc(projects.lastAnalyzedAt))

  return rows satisfies ProjectListItem[]
})
