ALTER TABLE "projects" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "full_name" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" varchar(20) DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_analyzed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "error_message" text;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_full_name_unique_idx" ON "projects" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_last_analyzed_at_idx" ON "projects" USING btree ("last_analyzed_at");