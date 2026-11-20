-- Statuses become the server's own words (TitleStatus), as
-- apps/server/src/metadata/vocabulary.ts maps them. Unknown ones go.
UPDATE "title" SET "status" = CASE lower(btrim("status"))
  WHEN 'returning series' THEN 'continuing'
  WHEN 'continuing' THEN 'continuing'
  WHEN 'ended' THEN 'ended'
  WHEN 'canceled' THEN 'canceled'
  WHEN 'cancelled' THEN 'canceled'
  WHEN 'planned' THEN 'upcoming'
  WHEN 'rumored' THEN 'upcoming'
  WHEN 'upcoming' THEN 'upcoming'
  WHEN 'announced' THEN 'upcoming'
  WHEN 'pre-production' THEN 'upcoming'
  WHEN 'completed' THEN 'upcoming'
  WHEN 'in production' THEN 'in-production'
  WHEN 'post production' THEN 'in-production'
  WHEN 'filming / post-production' THEN 'in-production'
  WHEN 'pilot' THEN 'pilot'
  WHEN 'released' THEN 'released'
END WHERE "status" IS NOT NULL;--> statement-breakpoint
-- Genres become keys (GENRES), from their English names: all of
-- TheTVDB's, and TMDB's in an English library. Names without a key stay.
UPDATE "title" SET "genres" = coalesce((
  SELECT array_agg("key" ORDER BY "first")
  FROM (
    SELECT "key", min("ord" * 10 + "part") AS "first"
    FROM unnest("title"."genres") WITH ORDINALITY AS "named"("name", "ord")
    CROSS JOIN LATERAL unnest(CASE lower(btrim("named"."name"))
      WHEN 'kids' THEN ARRAY['children']
      WHEN 'talk' THEN ARRAY['talk-show']
      WHEN 'action & adventure' THEN ARRAY['action', 'adventure']
      WHEN 'sci-fi & fantasy' THEN ARRAY['science-fiction', 'fantasy']
      WHEN 'war & politics' THEN ARRAY['war', 'politics']
      ELSE CASE
        WHEN regexp_replace(lower(btrim("named"."name")), '\s+', '-', 'g') = ANY(ARRAY['action', 'adventure', 'animation', 'anime', 'awards-show', 'children', 'comedy', 'crime', 'documentary', 'drama', 'eastern', 'family', 'fantasy', 'food', 'game-show', 'history', 'home-and-garden', 'horror', 'indie', 'martial-arts', 'mini-series', 'music', 'musical', 'mystery', 'news', 'podcast', 'politics', 'reality', 'romance', 'science-fiction', 'soap', 'special-interest', 'sport', 'suspense', 'talk-show', 'thriller', 'travel', 'tv-movie', 'war', 'western'])
          THEN ARRAY[regexp_replace(lower(btrim("named"."name")), '\s+', '-', 'g')]
        ELSE ARRAY[btrim("named"."name")]
      END
    END) WITH ORDINALITY AS "keys"("key", "part")
    GROUP BY "key"
  ) AS "mapped"
), '{}'::text[]);--> statement-breakpoint
-- TMDB names genres in the library's language. Fetch again the titles
-- that still have a genre without a key, which then come back by id.
UPDATE "title" SET "refreshed_at" = NULL
WHERE "provider" = 'tmdb'
  AND NOT ("genres" <@ ARRAY['action', 'adventure', 'animation', 'anime', 'awards-show', 'children', 'comedy', 'crime', 'documentary', 'drama', 'eastern', 'family', 'fantasy', 'food', 'game-show', 'history', 'home-and-garden', 'horror', 'indie', 'martial-arts', 'mini-series', 'music', 'musical', 'mystery', 'news', 'podcast', 'politics', 'reality', 'romance', 'science-fiction', 'soap', 'special-interest', 'sport', 'suspense', 'talk-show', 'thriller', 'travel', 'tv-movie', 'war', 'western']::text[]);--> statement-breakpoint
ALTER TABLE "playback_session" ADD COLUMN "client_browser" text;--> statement-breakpoint
ALTER TABLE "playback_session" ADD COLUMN "client_system" text;--> statement-breakpoint
-- "Firefox on Linux" splits in two. A single word was a browser, a
-- system, or an app's name.
UPDATE "playback_session" SET
  "client_browser" = CASE
    WHEN "client" LIKE '% on %' THEN split_part("client", ' on ', 1)
    WHEN "client" IN ('iOS', 'Android', 'ChromeOS', 'Windows', 'macOS', 'Linux') THEN NULL
    ELSE "client"
  END,
  "client_system" = CASE
    WHEN "client" LIKE '% on %' THEN substr("client", position(' on ' IN "client") + 4)
    WHEN "client" IN ('iOS', 'Android', 'ChromeOS', 'Windows', 'macOS', 'Linux') THEN "client"
  END
WHERE "client" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "playback_session" DROP COLUMN "client";
