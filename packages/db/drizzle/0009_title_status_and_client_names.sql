-- A show's status becomes a TitleStatus, mapped as
-- apps/server/src/metadata/status.ts maps it, as Jellyfin does. Movies keep
-- none, and a word the table doesn't have goes.
UPDATE "title" SET "status" = CASE
  WHEN "kind" <> 'show' THEN NULL
  ELSE CASE lower(btrim("status"))
    WHEN 'continuing' THEN 'continuing'
    WHEN 'ended' THEN 'ended'
    WHEN 'unreleased' THEN 'unreleased'
    WHEN 'returning series' THEN 'continuing'
    WHEN 'returning' THEN 'continuing'
    WHEN 'pilot' THEN 'continuing'
    WHEN 'canceled' THEN 'ended'
    WHEN 'cancelled' THEN 'ended'
    WHEN 'upcoming' THEN 'unreleased'
  END
END WHERE "status" IS NOT NULL;--> statement-breakpoint
-- Each client now names itself through account.sessions.identify. A
-- session signed in before this has no name until its client next starts.
ALTER TABLE "session" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "user_agent";--> statement-breakpoint
-- Plays named from the User-Agent, like "Chrome on Linux", take the names
-- browsers now give themselves, so one browser stays one client: "Chrome"
-- on a computer, "Chrome Android" on Android. "on iOS" stood for an iPhone
-- or an iPad, which the new names tell apart, and an app's single word,
-- like "Android" or "Matinee", for more than one app, so those stay.
UPDATE "playback_session" SET "client" = regexp_replace(
  regexp_replace("client", ' on Android$', ' Android'),
  ' on (Linux|Windows|macOS|ChromeOS)$', ''
)
WHERE "client" ~ ' on (Android|Linux|Windows|macOS|ChromeOS)$';
