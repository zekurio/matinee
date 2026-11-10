CREATE TABLE "track_pick" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"audio_stream_index" integer,
	"audio_picked_at" timestamp with time zone,
	"subtitle_track_id" text,
	"subtitle_picked_at" timestamp with time zone,
	CONSTRAINT "track_pick_user_id_media_item_id_pk" PRIMARY KEY("user_id","media_item_id")
);
--> statement-breakpoint
ALTER TABLE "track_pick" ADD CONSTRAINT "track_pick_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_pick" ADD CONSTRAINT "track_pick_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;