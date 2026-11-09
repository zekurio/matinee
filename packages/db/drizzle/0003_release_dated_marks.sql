ALTER TABLE "playback_session" ADD COLUMN "release_dated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Marks made before the column: a mark on a file's release or air date is
-- stored at noon UTC on that day, a time no other mark lands on.
UPDATE "playback_session" AS "ps"
SET "release_dated" = true
FROM "media_item" AS "mi"
LEFT JOIN "title" AS "t" ON "t"."id" = "mi"."title_id"
LEFT JOIN "episode" AS "e"
  ON "e"."title_id" = "mi"."title_id"
  AND "e"."season_number" = "mi"."season_number"
  AND "e"."episode_number" = "mi"."episode_number"
WHERE "ps"."media_item_id" = "mi"."id"
  AND "ps"."marked"
  AND "ps"."ended_at" = (
    (CASE WHEN "t"."kind" = 'show' THEN "e"."air_date" ELSE "t"."release_date" END)
    + time '12:00'
  ) AT TIME ZONE 'UTC';
