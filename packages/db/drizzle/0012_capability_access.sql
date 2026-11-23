ALTER TABLE "access_group" ADD COLUMN "downloads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "access_group" ADD COLUMN "requests" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_group" ADD COLUMN "api_tokens" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "access_group" ADD COLUMN "manages" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- A group's permission list becomes its capabilities. An area of running
-- the server gets the highest level whose permissions the group held in
-- full, so a hand-picked part of one grants nothing more than it did.
UPDATE "access_group" SET
  "downloads" = 'media.download' = ANY("permissions"),
  "requests" = CASE
    WHEN "permissions" @> ARRAY['request.create', 'request.autoApprove'] THEN 'add'
    WHEN 'request.create' = ANY("permissions") THEN 'ask'
    ELSE 'off' END,
  "api_tokens" = 'apiToken.create' = ANY("permissions"),
  "manages" = jsonb_build_object(
    'requests', CASE WHEN "permissions" @> ARRAY['adminRequest.read', 'adminRequest.update'] THEN 'manage' WHEN "permissions" @> ARRAY['adminRequest.read'] THEN 'view' ELSE 'none' END,
    'connections', CASE WHEN "permissions" @> ARRAY['fulfilment.read', 'fulfilment.create', 'fulfilment.update', 'fulfilment.delete'] THEN 'manage' WHEN "permissions" @> ARRAY['fulfilment.read'] THEN 'view' ELSE 'none' END,
    'libraries', CASE WHEN "permissions" @> ARRAY['folder.read', 'library.create', 'library.update', 'library.delete', 'library.scan'] THEN 'manage' ELSE 'none' END,
    'metadata', CASE WHEN "permissions" @> ARRAY['title.update'] THEN 'manage' ELSE 'none' END,
    'users', CASE WHEN "permissions" @> ARRAY['adminUser.read', 'group.read', 'invite.read', 'serverStats.read', 'adminUser.update', 'adminUser.delete', 'adminSession.delete', 'adminApiToken.delete', 'group.create', 'group.update', 'group.delete', 'invite.create', 'invite.delete'] THEN 'manage' WHEN "permissions" @> ARRAY['adminUser.read', 'group.read', 'invite.read', 'serverStats.read'] THEN 'view' ELSE 'none' END,
    'server', CASE WHEN "permissions" @> ARRAY['authSettings.read', 'branding.read', 'networkSettings.read', 'transcodingSettings.read', 'trickplaySettings.read', 'job.read', 'branding.update', 'networkSettings.update', 'transcodingSettings.update', 'trickplaySettings.update', 'job.update', 'serverSetup.update'] THEN 'manage' WHEN "permissions" @> ARRAY['authSettings.read', 'branding.read', 'networkSettings.read', 'transcodingSettings.read', 'trickplaySettings.read', 'job.read'] THEN 'view' ELSE 'none' END
  );--> statement-breakpoint
-- An account's allowed and denied permissions become the capabilities its
-- override sets. One it neither allowed nor denied in full follows its
-- groups.
UPDATE "user" SET "access_override" = ("access_override" - 'allow' - 'deny') || jsonb_strip_nulls(jsonb_build_object(
  'downloads', CASE
    WHEN "access_override"->'allow' ? 'media.download' THEN true
    WHEN "access_override"->'deny' ? 'media.download' THEN false END,
  'requests', CASE
    WHEN "access_override"->'deny' ? 'request.create' THEN 'off'
    WHEN "access_override"->'allow' ?& ARRAY['request.create', 'request.autoApprove'] THEN 'add'
    WHEN "access_override"->'allow' ? 'request.create' THEN 'ask' END,
  'apiTokens', CASE
    WHEN "access_override"->'allow' ? 'apiToken.create' THEN true
    WHEN "access_override"->'deny' ? 'apiToken.create' THEN false END,
  'manages', NULLIF(jsonb_strip_nulls(jsonb_build_object(
    'requests', CASE WHEN "access_override"->'allow' ?& ARRAY['adminRequest.read', 'adminRequest.update'] THEN 'manage' WHEN "access_override"->'allow' ?& ARRAY['adminRequest.read'] THEN 'view' WHEN "access_override"->'deny' ?| ARRAY['adminRequest.read', 'adminRequest.update'] THEN 'none' END,
    'connections', CASE WHEN "access_override"->'allow' ?& ARRAY['fulfilment.read', 'fulfilment.create', 'fulfilment.update', 'fulfilment.delete'] THEN 'manage' WHEN "access_override"->'allow' ?& ARRAY['fulfilment.read'] THEN 'view' WHEN "access_override"->'deny' ?| ARRAY['fulfilment.read', 'fulfilment.create', 'fulfilment.update', 'fulfilment.delete'] THEN 'none' END,
    'libraries', CASE WHEN "access_override"->'allow' ?& ARRAY['folder.read', 'library.create', 'library.update', 'library.delete', 'library.scan'] THEN 'manage' WHEN "access_override"->'deny' ?| ARRAY['folder.read', 'library.create', 'library.update', 'library.delete', 'library.scan'] THEN 'none' END,
    'metadata', CASE WHEN "access_override"->'allow' ?& ARRAY['title.update'] THEN 'manage' WHEN "access_override"->'deny' ?| ARRAY['title.update'] THEN 'none' END,
    'users', CASE WHEN "access_override"->'allow' ?& ARRAY['adminUser.read', 'group.read', 'invite.read', 'serverStats.read', 'adminUser.update', 'adminUser.delete', 'adminSession.delete', 'adminApiToken.delete', 'group.create', 'group.update', 'group.delete', 'invite.create', 'invite.delete'] THEN 'manage' WHEN "access_override"->'allow' ?& ARRAY['adminUser.read', 'group.read', 'invite.read', 'serverStats.read'] THEN 'view' WHEN "access_override"->'deny' ?| ARRAY['adminUser.read', 'group.read', 'invite.read', 'serverStats.read', 'adminUser.update', 'adminUser.delete', 'adminSession.delete', 'adminApiToken.delete', 'group.create', 'group.update', 'group.delete', 'invite.create', 'invite.delete'] THEN 'none' END,
    'server', CASE WHEN "access_override"->'allow' ?& ARRAY['authSettings.read', 'branding.read', 'networkSettings.read', 'transcodingSettings.read', 'trickplaySettings.read', 'job.read', 'branding.update', 'networkSettings.update', 'transcodingSettings.update', 'trickplaySettings.update', 'job.update', 'serverSetup.update'] THEN 'manage' WHEN "access_override"->'allow' ?& ARRAY['authSettings.read', 'branding.read', 'networkSettings.read', 'transcodingSettings.read', 'trickplaySettings.read', 'job.read'] THEN 'view' WHEN "access_override"->'deny' ?| ARRAY['authSettings.read', 'branding.read', 'networkSettings.read', 'transcodingSettings.read', 'trickplaySettings.read', 'job.read', 'branding.update', 'networkSettings.update', 'transcodingSettings.update', 'trickplaySettings.update', 'job.update', 'serverSetup.update'] THEN 'none' END
  )), '{}'::jsonb)
)) WHERE "access_override" ?| ARRAY['allow', 'deny'];--> statement-breakpoint
ALTER TABLE "access_group" DROP COLUMN "permissions";