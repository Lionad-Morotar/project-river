CREATE UNIQUE INDEX "commit_files_commit_path_idx" ON "commit_files" USING btree ("commit_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "commits_project_hash_idx" ON "commits" USING btree ("project_id","hash");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_project_date_contributor_idx" ON "daily_stats" USING btree ("project_id","date","contributor");--> statement-breakpoint
CREATE UNIQUE INDEX "sum_day_project_date_contributor_idx" ON "sum_day" USING btree ("project_id","date","contributor");