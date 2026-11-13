CREATE TABLE "favorite_season" (
	"user_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_season_user_id_title_id_season_number_pk" PRIMARY KEY("user_id","title_id","season_number")
);
--> statement-breakpoint
ALTER TABLE "favorite_season" ADD CONSTRAINT "favorite_season_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_season" ADD CONSTRAINT "favorite_season_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_season_recent_idx" ON "favorite_season" USING btree ("user_id","created_at");