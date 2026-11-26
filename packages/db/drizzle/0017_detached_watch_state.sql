CREATE TABLE "detached_watch_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"keys" text[] NOT NULL,
	"position_seconds" double precision,
	"completed" boolean DEFAULT false NOT NULL,
	"progress_at" timestamp with time zone,
	"favorite" boolean DEFAULT false NOT NULL,
	"session_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"detached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detached_watch_state" ADD CONSTRAINT "detached_watch_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detached_watch_state_keys_idx" ON "detached_watch_state" USING gin ("keys");--> statement-breakpoint
CREATE INDEX "detached_watch_state_detached_idx" ON "detached_watch_state" USING btree ("detached_at");