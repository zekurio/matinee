DROP TABLE "notification" CASCADE;--> statement-breakpoint
DROP TABLE "web_push_subscription" CASCADE;--> statement-breakpoint
ALTER TABLE "title_features" ADD COLUMN "runtime_minutes" integer;--> statement-breakpoint
ALTER TABLE "title_features" ADD COLUMN "ratings" jsonb;--> statement-breakpoint
DELETE FROM "setting" WHERE "key" = 'web-push';--> statement-breakpoint
DELETE FROM "request_follower" WHERE "asked" = false;--> statement-breakpoint
ALTER TABLE "request_follower" DROP COLUMN "asked";--> statement-breakpoint
-- Discover's rows read TMDB's discover endpoint now, not its feeds.
DELETE FROM "provider_cache" WHERE "key" LIKE '["tmdb",%,"feed",%';
