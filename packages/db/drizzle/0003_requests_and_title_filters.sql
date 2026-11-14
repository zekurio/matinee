CREATE TABLE "fulfilment_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_movies" boolean DEFAULT false NOT NULL,
	"default_shows" boolean DEFAULT false NOT NULL,
	"folder_libraries" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"api_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfilment_connection_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fulfilment_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_id" uuid,
	"season" integer,
	"count" integer DEFAULT 1 NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"push_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"poster_id" text,
	"status" text DEFAULT 'asked' NOT NULL,
	"future" boolean DEFAULT false NOT NULL,
	"decline_reason" text,
	"decline_note" text,
	"declined_by" uuid,
	"declined_at" timestamp with time zone,
	"fulfilment_state" text,
	"fulfilment_error" text,
	"remote_ref" jsonb,
	"connection_id" uuid,
	"options" jsonb,
	"sent_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_follower" (
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"asked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_follower_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "request_season" (
	"request_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"arrived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_season_request_id_number_pk" PRIMARY KEY("request_id","number")
);
--> statement-breakpoint
CREATE TABLE "web_push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "access_group" ADD COLUMN "requests" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_group" ADD COLUMN "request_limit" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "show_specials" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfilment_rule" ADD CONSTRAINT "fulfilment_rule_connection_id_fulfilment_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."fulfilment_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_poster_id_artwork_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_declined_by_user_id_fk" FOREIGN KEY ("declined_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_connection_id_fulfilment_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."fulfilment_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_follower" ADD CONSTRAINT "request_follower_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_follower" ADD CONSTRAINT "request_follower_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_season" ADD CONSTRAINT "request_season_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscription" ADD CONSTRAINT "web_push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfilment_default_movies" ON "fulfilment_connection" USING btree ("default_movies") WHERE "fulfilment_connection"."default_movies";--> statement-breakpoint
CREATE UNIQUE INDEX "fulfilment_default_shows" ON "fulfilment_connection" USING btree ("default_shows") WHERE "fulfilment_connection"."default_shows";--> statement-breakpoint
CREATE INDEX "fulfilment_rule_connection_idx" ON "fulfilment_rule" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe" ON "notification" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "request_identity" ON "request" USING btree ("library_id","provider","provider_id");--> statement-breakpoint
CREATE INDEX "request_queue_idx" ON "request" USING btree ("status","fulfilment_state");--> statement-breakpoint
CREATE INDEX "request_arrival_idx" ON "request" USING btree ("arrived_at");--> statement-breakpoint
CREATE INDEX "request_follower_user_idx" ON "request_follower" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "web_push_user_idx" ON "web_push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "title_provider_identity_idx" ON "title" USING btree ("library_id","kind","provider","provider_id");--> statement-breakpoint
CREATE INDEX "title_external_ids_idx" ON "title" USING gin ("external_ids");--> statement-breakpoint
CREATE INDEX "title_year_idx" ON "title" USING btree ("library_id","year");--> statement-breakpoint
CREATE INDEX "title_rating_idx" ON "title" USING btree ("library_id","rating");--> statement-breakpoint
CREATE INDEX "title_runtime_idx" ON "title" USING btree ("library_id","runtime_minutes");