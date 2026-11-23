-- Clients load a provider's picture from the provider now, so the server's
-- copies of them go, and only uploads keep an avatar_id. sweepAvatars()
-- deletes the files at startup.
UPDATE "user" SET "avatar_id" = NULL WHERE "avatar_source" = 'provider';--> statement-breakpoint
UPDATE "user" SET "avatar_url" = NULL WHERE "avatar_source" <> 'provider';--> statement-breakpoint
-- A user who follows the provider shows the picture it sent last, even when
-- the old download of it failed.
UPDATE "user" AS u SET "avatar_url" = o."picture"
FROM "oidc_account" AS o
WHERE o."user_id" = u."id" AND u."avatar_source" = 'provider';
