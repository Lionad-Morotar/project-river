CREATE TABLE "commit_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"commit_id" integer NOT NULL,
	"path" text NOT NULL,
	"insertions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"hash" varchar(40) NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"author_email" varchar(320),
	"committer_date" timestamp (3) with time zone NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"date" date NOT NULL,
	"contributor" varchar(255) NOT NULL,
	"commits" integer DEFAULT 0 NOT NULL,
	"insertions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sum_day" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"date" date NOT NULL,
	"contributor" varchar(255) NOT NULL,
	"cumulative_commits" integer DEFAULT 0 NOT NULL,
	"cumulative_insertions" integer DEFAULT 0 NOT NULL,
	"cumulative_deletions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commit_files" ADD CONSTRAINT "commit_files_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "public"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sum_day" ADD CONSTRAINT "sum_day_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commit_files_commit_idx" ON "commit_files" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX "commits_project_date_idx" ON "commits" USING btree ("project_id","committer_date");--> statement-breakpoint
CREATE INDEX "daily_stats_project_date_idx" ON "daily_stats" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "sum_day_project_date_idx" ON "sum_day" USING btree ("project_id","date");