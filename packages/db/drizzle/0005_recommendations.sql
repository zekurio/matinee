CREATE TABLE "recommendation" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"title_id" uuid,
	"score" double precision NOT NULL,
	"reason" jsonb NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"poster" text,
	"release_date" text,
	"algorithm" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_user_id_kind_tmdb_id_pk" PRIMARY KEY("user_id","kind","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "recommendation_dismissal" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_dismissal_user_id_kind_tmdb_id_pk" PRIMARY KEY("user_id","kind","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "recommendation_impression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"surface" text NOT NULL,
	"rail" text NOT NULL,
	"position" integer NOT NULL,
	"score" double precision NOT NULL,
	"algorithm" text NOT NULL,
	"day" date NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_run" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"signals_at" timestamp with time zone,
	"algorithm" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_features" (
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"genre_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keyword_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_language" text,
	"year" integer,
	"rating" double precision,
	"votes" integer DEFAULT 0 NOT NULL,
	"popularity" double precision DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "title_features_kind_tmdb_id_pk" PRIMARY KEY("kind","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "user_title_signal" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" text NOT NULL,
	"title_id" uuid,
	"score" double precision NOT NULL,
	"watched_seconds" double precision DEFAULT 0 NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"completions" integer DEFAULT 0 NOT NULL,
	"last_watched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_title_signal_user_id_kind_tmdb_id_pk" PRIMARY KEY("user_id","kind","tmdb_id")
);
--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_dismissal" ADD CONSTRAINT "recommendation_dismissal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_impression" ADD CONSTRAINT "recommendation_impression_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_run" ADD CONSTRAINT "recommendation_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_title_signal" ADD CONSTRAINT "user_title_signal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_title_signal" ADD CONSTRAINT "user_title_signal_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_score_idx" ON "recommendation" USING btree ("user_id","score");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_impression_daily_idx" ON "recommendation_impression" USING btree ("user_id","kind","tmdb_id","surface","day");--> statement-breakpoint
CREATE INDEX "recommendation_impression_user_idx" ON "recommendation_impression" USING btree ("user_id","shown_at");--> statement-breakpoint
CREATE INDEX "title_features_fetched_idx" ON "title_features" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "user_title_signal_score_idx" ON "user_title_signal" USING btree ("user_id","score");