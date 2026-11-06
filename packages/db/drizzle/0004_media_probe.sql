ALTER TABLE "media_item" ADD COLUMN "probe" jsonb;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "probed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "probe_error" text;--> statement-breakpoint
CREATE INDEX "media_item_unprobed_idx" ON "media_item" USING btree ("library_id") WHERE "media_item"."probed_at" is null;