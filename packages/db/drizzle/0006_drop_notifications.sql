DROP TABLE "notification" CASCADE;--> statement-breakpoint
DROP TABLE "web_push_subscription" CASCADE;--> statement-breakpoint
DELETE FROM "setting" WHERE "key" = 'web-push';--> statement-breakpoint
DELETE FROM "request_follower" WHERE "asked" = false;--> statement-breakpoint
ALTER TABLE "request_follower" DROP COLUMN "asked";
