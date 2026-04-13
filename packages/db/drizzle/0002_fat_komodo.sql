-- Step 1: Add nullable column
ALTER TABLE "commit_files" ADD COLUMN "project_id" integer;
--> statement-breakpoint

-- Step 2: Backfill from commits table
UPDATE "commit_files"
SET "project_id" = "commits"."project_id"
FROM "commits"
WHERE "commit_files"."commit_id" = "commits"."id";
--> statement-breakpoint

-- Step 3: Set NOT NULL after backfill
ALTER TABLE "commit_files" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint

-- Step 4: Add foreign key and index
ALTER TABLE "commit_files" ADD CONSTRAINT "commit_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "commit_files_project_idx" ON "commit_files" USING btree ("project_id");
