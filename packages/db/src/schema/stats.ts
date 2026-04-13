import { date, index, integer, pgTable, serial, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { projects } from './core'

export const daily_stats = pgTable('daily_stats', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  contributor: varchar('contributor', { length: 255 }).notNull(),
  commits: integer('commits').notNull().default(0),
  insertions: integer('insertions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
  filesTouched: integer('files_touched').notNull().default(0),
}, table => [
  index('daily_stats_project_date_idx').on(table.projectId, table.date),
  uniqueIndex('daily_stats_project_date_contributor_idx').on(table.projectId, table.date, table.contributor),
])

export const sum_day = pgTable('sum_day', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  contributor: varchar('contributor', { length: 255 }).notNull(),
  cumulativeCommits: integer('cumulative_commits').notNull().default(0),
  cumulativeInsertions: integer('cumulative_insertions').notNull().default(0),
  cumulativeDeletions: integer('cumulative_deletions').notNull().default(0),
}, table => [
  index('sum_day_project_date_idx').on(table.projectId, table.date),
  uniqueIndex('sum_day_project_date_contributor_idx').on(table.projectId, table.date, table.contributor),
])
