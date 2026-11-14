CREATE TABLE "plugin" (
	"id" text PRIMARY KEY NOT NULL,
	"source" jsonb NOT NULL,
	"manifest" jsonb,
	"enabled" boolean DEFAULT false NOT NULL,
	"grant" jsonb,
	"integrity" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"update" jsonb,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "plugin_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"plugin_id" text NOT NULL,
	"name" text NOT NULL,
	"lane" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "plugin_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"subject" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plugin_storage" (
	"plugin_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_storage_plugin_id_key_pk" PRIMARY KEY("plugin_id","key")
);
--> statement-breakpoint
ALTER TABLE "plugin_event" ADD CONSTRAINT "plugin_event_plugin_id_plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_identity" ADD CONSTRAINT "plugin_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_identity" ADD CONSTRAINT "plugin_identity_plugin_id_plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_storage" ADD CONSTRAINT "plugin_storage_plugin_id_plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_event_plugin_id_idx" ON "plugin_event" USING btree ("plugin_id","id");--> statement-breakpoint
CREATE INDEX "plugin_event_lane_idx" ON "plugin_event" USING btree ("plugin_id","lane","id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_identity_subject" ON "plugin_identity" USING btree ("plugin_id","provider_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_identity_user_provider" ON "plugin_identity" USING btree ("user_id","plugin_id","provider_id");