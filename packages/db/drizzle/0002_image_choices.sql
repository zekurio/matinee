ALTER TABLE "artwork" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "still_chosen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "season" ADD COLUMN "poster_chosen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "title" ADD COLUMN "chosen_images" text[] DEFAULT '{}'::text[] NOT NULL;