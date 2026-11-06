CREATE TABLE "watch_progress" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"position_seconds" double precision NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_id_media_item_id_pk" PRIMARY KEY("user_id","media_item_id")
);
--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "duration_seconds" double precision;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_progress_recent_idx" ON "watch_progress" USING btree ("user_id","updated_at");