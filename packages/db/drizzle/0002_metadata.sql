CREATE TABLE "artwork" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"title_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"name" text,
	"overview" text,
	"air_date" date,
	"runtime_minutes" integer,
	"still_id" text,
	CONSTRAINT "episode_title_id_season_number_episode_number_pk" PRIMARY KEY("title_id","season_number","episode_number")
);
--> statement-breakpoint
CREATE TABLE "season" (
	"title_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"overview" text,
	"poster_id" text,
	CONSTRAINT "season_title_id_number_pk" PRIMARY KEY("title_id","number")
);
--> statement-breakpoint
CREATE TABLE "title" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"sort_name" text NOT NULL,
	"original_name" text,
	"year" integer,
	"overview" text,
	"tagline" text,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"rating" double precision,
	"content_rating" text,
	"release_date" date,
	"status" text,
	"runtime_minutes" integer,
	"poster_id" text,
	"backdrop_id" text,
	"logo_id" text,
	"provider" text,
	"provider_id" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library" ADD COLUMN "metadata_provider" text;--> statement-breakpoint
ALTER TABLE "library" ADD COLUMN "metadata_language" text DEFAULT 'en-US' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "title_id" uuid;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "season_number" integer;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "episode_number" integer;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_still_id_artwork_id_fk" FOREIGN KEY ("still_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_poster_id_artwork_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_poster_id_artwork_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_backdrop_id_artwork_id_fk" FOREIGN KEY ("backdrop_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_logo_id_artwork_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "title_library_path" ON "title" USING btree ("library_id","path");--> statement-breakpoint
CREATE INDEX "title_sort_idx" ON "title" USING btree ("library_id","sort_name");--> statement-breakpoint
CREATE INDEX "title_added_idx" ON "title" USING btree ("library_id","added_at");--> statement-breakpoint
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_item_title_id_idx" ON "media_item" USING btree ("title_id","season_number","episode_number");