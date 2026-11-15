ALTER TABLE "title_features" ADD COLUMN "runtime_minutes" integer;--> statement-breakpoint
ALTER TABLE "title_features" ADD COLUMN "ratings" jsonb;--> statement-breakpoint
-- Discover's rows read TMDB's discover endpoint now, not its feeds.
DELETE FROM "provider_cache" WHERE "key" LIKE '["tmdb",%,"feed",%';
