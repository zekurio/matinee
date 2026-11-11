CREATE TABLE "access_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"everyone" boolean DEFAULT false NOT NULL,
	"provider_group" text,
	"all_libraries" boolean DEFAULT false NOT NULL,
	"max_bitrate" integer,
	"transcode" boolean DEFAULT true NOT NULL,
	"downloads" boolean DEFAULT true NOT NULL,
	"max_streams" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_group_library" (
	"group_id" uuid NOT NULL,
	"library_id" uuid NOT NULL,
	CONSTRAINT "access_group_library_group_id_library_id_pk" PRIMARY KEY("group_id","library_id")
);
--> statement-breakpoint
CREATE TABLE "access_group_member" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "access_group_member_group_id_user_id_source_pk" PRIMARY KEY("group_id","user_id","source")
);
--> statement-breakpoint
CREATE TABLE "invite_group" (
	"invite_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "invite_group_invite_id_group_id_pk" PRIMARY KEY("invite_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "oidc_account" ADD COLUMN "groups" text[];--> statement-breakpoint
ALTER TABLE "oidc_account" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "oidc_account" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_override" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_override_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_group_library" ADD CONSTRAINT "access_group_library_group_id_access_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."access_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_group_library" ADD CONSTRAINT "access_group_library_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_group_member" ADD CONSTRAINT "access_group_member_group_id_access_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."access_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_group_member" ADD CONSTRAINT "access_group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_group" ADD CONSTRAINT "invite_group_invite_id_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_group" ADD CONSTRAINT "invite_group_group_id_access_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."access_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_group_name_lower" ON "access_group" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "access_group_everyone" ON "access_group" USING btree ("everyone") WHERE "access_group"."everyone";--> statement-breakpoint
CREATE INDEX "access_group_member_user_idx" ON "access_group_member" USING btree ("user_id");--> statement-breakpoint
-- The built-in group. It starts with everything, so accounts keep what
-- they had before groups.
INSERT INTO "access_group" ("name", "everyone", "all_libraries") VALUES ('Everyone', true, true);
