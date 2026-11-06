CREATE TABLE "subtitle_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_item_id" uuid NOT NULL,
	"path" text NOT NULL,
	"format" text NOT NULL,
	"language" text,
	"title" text,
	"forced" boolean DEFAULT false NOT NULL,
	"sdh" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subtitle_file" ADD CONSTRAINT "subtitle_file_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subtitle_file_item_path" ON "subtitle_file" USING btree ("media_item_id","path");