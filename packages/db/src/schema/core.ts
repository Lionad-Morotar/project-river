import { index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).defaultNow().notNull(),
  url: text('url'),
  fullName: varchar('full_name', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('ready'),
  description: text('description'),
  lastAnalyzedAt: timestamp('last_analyzed_at', { mode: 'date', precision: 3, withTimezone: true }),
  errorMessage: text('error_message'),
}, table => [
  uniqueIndex('projects_full_name_unique_idx').on(table.fullName),
  index('projects_status_idx').on(table.status),
  index('projects_last_analyzed_at_idx').on(table.lastAnalyzedAt),
])

export const commits = pgTable('commits', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  hash: varchar('hash', { length: 40 }).notNull(),
  authorName: varchar('author_name', { length: 255 }).notNull(),
  authorEmail: varchar('author_email', { length: 320 }),
  committerDate: timestamp('committer_date', { mode: 'date', precision: 3, withTimezone: true }).notNull(),
  message: text('message'),
}, table => [
  index('commits_project_date_idx').on(table.projectId, table.committerDate),
  uniqueIndex('commits_project_hash_idx').on(table.projectId, table.hash),
])

export const commit_files = pgTable('commit_files', {
  id: serial('id').primaryKey(),
  commitId: integer('commit_id').notNull().references(() => commits.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  insertions: integer('insertions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
}, table => [
  index('commit_files_commit_idx').on(table.commitId),
  index('commit_files_project_idx').on(table.projectId),
  uniqueIndex('commit_files_commit_path_idx').on(table.commitId, table.path),
])
