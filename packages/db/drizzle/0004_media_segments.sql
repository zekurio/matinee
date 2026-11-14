CREATE TABLE "media_segments" (
	"media_item_id" uuid PRIMARY KEY NOT NULL,
	"size_bytes" bigint NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"version" integer NOT NULL,
	"segments" jsonb NOT NULL,
	"peers" integer NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_segments" ADD CONSTRAINT "media_segments_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;