ALTER TABLE "artwork" ADD COLUMN "catalog" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_photo_idx" ON "credit" USING btree ("photo_id") WHERE "credit"."photo_id" is not null;--> statement-breakpoint
CREATE INDEX "episode_still_idx" ON "episode" USING btree ("still_id") WHERE "episode"."still_id" is not null;--> statement-breakpoint
CREATE INDEX "season_poster_idx" ON "season" USING btree ("poster_id") WHERE "season"."poster_id" is not null;--> statement-breakpoint
CREATE INDEX "title_poster_idx" ON "title" USING btree ("poster_id") WHERE "title"."poster_id" is not null;--> statement-breakpoint
CREATE INDEX "title_backdrop_idx" ON "title" USING btree ("backdrop_id") WHERE "title"."backdrop_id" is not null;--> statement-breakpoint
CREATE INDEX "title_logo_idx" ON "title" USING btree ("logo_id") WHERE "title"."logo_id" is not null;--> statement-breakpoint
-- Artwork saved before the marker existed: what no library row uses came
-- from the catalog, and so did a request's poster.
UPDATE "artwork" SET "catalog" = true
WHERE EXISTS (SELECT 1 FROM "request" WHERE "request"."poster_id" = "artwork"."id")
  OR NOT (
    EXISTS (SELECT 1 FROM "title" WHERE "title"."poster_id" = "artwork"."id")
    OR EXISTS (SELECT 1 FROM "title" WHERE "title"."backdrop_id" = "artwork"."id")
    OR EXISTS (SELECT 1 FROM "title" WHERE "title"."logo_id" = "artwork"."id")
    OR EXISTS (SELECT 1 FROM "season" WHERE "season"."poster_id" = "artwork"."id")
    OR EXISTS (SELECT 1 FROM "episode" WHERE "episode"."still_id" = "artwork"."id")
    OR EXISTS (SELECT 1 FROM "credit" WHERE "credit"."photo_id" = "artwork"."id")
  );
