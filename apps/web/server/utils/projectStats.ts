import type { SQL } from 'drizzle-orm'
import { db } from '@project-river/db/client'
import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { z } from 'zod'

export interface MonthlyStatsRow {
  yearMonth: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
}

export interface DailyStatsRow {
  date: string
  contributor: string
  commits: number
  linesAdded: number
  linesDeleted: number
  filesTouched: number
  cumulativeCommits: number
}

export const monthlyQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})

export const dailyQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})

export type MonthlyQuery = z.infer<typeof monthlyQuerySchema>
export type DailyQuery = z.infer<typeof dailyQuerySchema>

export async function assertProjectExists(projectId: number): Promise<void> {
  const projectCheck = await db.execute(sql`SELECT 1 FROM projects WHERE id = ${projectId} LIMIT 1`)
  if (projectCheck.rowCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
}

export function buildMonthlyDateBounds(
  projectId: number,
  start?: string,
  end?: string,
): { startDate: SQL, endDate: SQL } {
  return {
    startDate: start
      ? sql`${start}-01`
      : sql`(SELECT MIN(date) FROM daily_stats WHERE project_id = ${projectId})`,
    endDate: end
      ? sql`((${end}-01 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')`
      : sql`(SELECT MAX(date) FROM daily_stats WHERE project_id = ${projectId})`,
  }
}

export function buildDailyDateBounds(
  projectId: number,
  start?: string,
  end?: string,
): { startDate: SQL, endDate: SQL } {
  return {
    startDate: start
      ? sql`${start}::date`
      : sql`(SELECT MIN(date) FROM daily_stats WHERE project_id = ${projectId})`,
    endDate: end
      ? sql`${end}::date`
      : sql`(SELECT MAX(date) FROM daily_stats WHERE project_id = ${projectId})`,
  }
}
