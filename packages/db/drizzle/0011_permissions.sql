ALTER TABLE "api_token" ADD COLUMN "permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "access_group" ADD COLUMN "permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- A group's download switch and request setting become permissions.
-- Downloads were a limit, which a group that opens no library had no say
-- in, and permissions add up across groups, so only a group that opens a
-- library keeps the download one.
UPDATE "access_group" SET "permissions" = array_remove(ARRAY[
  CASE WHEN "downloads" AND ("all_libraries" OR EXISTS (
    SELECT 1 FROM "access_group_library" WHERE "access_group_library"."group_id" = "access_group"."id"
  )) THEN 'media.download' END,
  CASE WHEN "requests" IN ('ask', 'add') THEN 'request.create' END,
  CASE WHEN "requests" = 'add' THEN 'request.autoApprove' END
], NULL);--> statement-breakpoint
-- Every account could make API tokens until now, so the group every
-- account is in grants it.
UPDATE "access_group" SET "permissions" = "permissions" || ARRAY['apiToken.create'] WHERE "everyone";--> statement-breakpoint
-- The same two settings on an account's own override become what it
-- allows and denies over its groups.
UPDATE "user" SET "access_override" = ("access_override" - 'downloads' - 'requests') || jsonb_strip_nulls(jsonb_build_object(
  'allow', NULLIF(to_jsonb(array_remove(ARRAY[
    CASE WHEN "access_override"->>'downloads' = 'true' THEN 'media.download' END,
    CASE WHEN "access_override"->>'requests' IN ('ask', 'add') THEN 'request.create' END,
    CASE WHEN "access_override"->>'requests' = 'add' THEN 'request.autoApprove' END
  ], NULL)), '[]'::jsonb),
  'deny', NULLIF(to_jsonb(array_remove(ARRAY[
    CASE WHEN "access_override"->>'downloads' = 'false' THEN 'media.download' END,
    CASE WHEN "access_override"->>'requests' = 'off' THEN 'request.create' END,
    CASE WHEN "access_override"->>'requests' IN ('off', 'ask') THEN 'request.autoApprove' END
  ], NULL)), '[]'::jsonb)
)) WHERE "access_override" ?| ARRAY['downloads', 'requests'];--> statement-breakpoint
ALTER TABLE "access_group" DROP COLUMN "downloads";--> statement-breakpoint
ALTER TABLE "access_group" DROP COLUMN "requests";
