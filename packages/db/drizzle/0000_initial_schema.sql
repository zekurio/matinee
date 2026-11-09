CREATE TABLE "favorite" (
	"user_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_user_id_title_id_pk" PRIMARY KEY("user_id","title_id")
);
--> statement-breakpoint
CREATE TABLE "favorite_item" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_item_user_id_media_item_id_pk" PRIMARY KEY("user_id","media_item_id")
);
--> statement-breakpoint
CREATE TABLE "playback_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"media_item_id" uuid,
	"title_id" uuid,
	"title_kind" text,
	"position_seconds" double precision DEFAULT 0 NOT NULL,
	"watched_seconds" double precision DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"marked" boolean DEFAULT false NOT NULL,
	"precision" text DEFAULT 'time' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"method" text DEFAULT 'direct' NOT NULL,
	"audio_converted" boolean DEFAULT false NOT NULL,
	"video_codec" text,
	"audio_codec" text,
	"video_encoder" text,
	"hardware_encoding" boolean DEFAULT false NOT NULL,
	"hardware_decoding" boolean DEFAULT false NOT NULL,
	"tone_mapper" text,
	"audio_encoder" text,
	"quality" text,
	"encode_seconds" double precision DEFAULT 0 NOT NULL,
	"client" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "watch_progress" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"position_seconds" double precision NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_id_media_item_id_pk" PRIMARY KEY("user_id","media_item_id")
);
--> statement-breakpoint
CREATE TABLE "auth_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"challenge" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_authorization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"device_name" text,
	"platform" text NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_authorization_deviceCodeHash_unique" UNIQUE("device_code_hash"),
	CONSTRAINT "device_authorization_userCode_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "oidc_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"label" text,
	"picture" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" text[],
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "passkey_credentialId_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"client" text DEFAULT 'web' NOT NULL,
	"device_name" text,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "scheduled_task" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"result" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "artwork" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text,
	"blurhash" text,
	"aspect_ratio" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit" (
	"title_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"person_id" text,
	"photo_id" text,
	CONSTRAINT "credit_title_id_position_pk" PRIMARY KEY("title_id","position")
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"title_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"name" text,
	"overview" text,
	"air_date" date,
	"runtime_minutes" integer,
	"still_id" text,
	"still_chosen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "episode_title_id_season_number_episode_number_pk" PRIMARY KEY("title_id","season_number","episode_number")
);
--> statement-breakpoint
CREATE TABLE "library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"metadata_provider" text,
	"metadata_language" text DEFAULT 'en-US' NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"title_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"overview" text,
	"poster_id" text,
	"poster_chosen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "season_title_id_number_pk" PRIMARY KEY("title_id","number")
);
--> statement-breakpoint
CREATE TABLE "title" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"sort_name" text NOT NULL,
	"original_name" text,
	"original_language" text,
	"year" integer,
	"overview" text,
	"tagline" text,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"rating" double precision,
	"content_rating" text,
	"release_date" date,
	"status" text,
	"runtime_minutes" integer,
	"studios" text[] DEFAULT '{}'::text[] NOT NULL,
	"poster_id" text,
	"backdrop_id" text,
	"logo_id" text,
	"chosen_images" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider" text,
	"provider_id" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"path" text NOT NULL,
	"relative_path" text NOT NULL,
	"title" text NOT NULL,
	"title_id" uuid,
	"season_number" integer,
	"episode_number" integer,
	"container" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"file_created_at" timestamp with time zone,
	"duration_seconds" double precision,
	"probe" jsonb,
	"probed_at" timestamp with time zone,
	"probe_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "trickplay" (
	"media_item_id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"columns" integer NOT NULL,
	"rows" integer NOT NULL,
	"count" integer NOT NULL,
	"interval_seconds" double precision NOT NULL,
	"keyframes_only" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"theme_preferences" jsonb,
	"playback_preferences" jsonb,
	"avatar_id" text,
	"avatar_source" text DEFAULT 'provider' NOT NULL,
	"avatar_url" text,
	"share_favorites" boolean DEFAULT false NOT NULL,
	"share_stats" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_theme" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"variants" jsonb NOT NULL,
	"guided" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_theme_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "user_theme_variants_check" CHECK (jsonb_typeof("user_theme"."variants") = 'array' and jsonb_array_length("user_theme"."variants") > 0)
);
--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_item" ADD CONSTRAINT "favorite_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_item" ADD CONSTRAINT "favorite_item_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_authorization" ADD CONSTRAINT "device_authorization_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_account" ADD CONSTRAINT "oidc_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_photo_id_artwork_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_still_id_artwork_id_fk" FOREIGN KEY ("still_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_folder" ADD CONSTRAINT "library_folder_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_poster_id_artwork_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_poster_id_artwork_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_backdrop_id_artwork_id_fk" FOREIGN KEY ("backdrop_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_logo_id_artwork_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."artwork"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_folder_id_library_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."library_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_file" ADD CONSTRAINT "subtitle_file_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trickplay" ADD CONSTRAINT "trickplay_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_theme" ADD CONSTRAINT "user_theme_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_recent_idx" ON "favorite" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "favorite_item_recent_idx" ON "favorite_item" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "playback_session_started_idx" ON "playback_session" USING btree ("started_at","user_id","watched_seconds","completed","title_kind","title_id","media_item_id");--> statement-breakpoint
CREATE INDEX "playback_session_user_idx" ON "playback_session" USING btree ("user_id","started_at","watched_seconds","completed","title_kind","title_id","media_item_id");--> statement-breakpoint
CREATE INDEX "playback_session_item_idx" ON "playback_session" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "playback_session_title_idx" ON "playback_session" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "playback_session_open_idx" ON "playback_session" USING btree ("updated_at") WHERE "playback_session"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "watch_progress_recent_idx" ON "watch_progress" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "auth_challenge_expires_idx" ON "auth_challenge" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_account_issuer_subject" ON "oidc_account" USING btree ("issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_account_user_id" ON "oidc_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_name_idx" ON "credit" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "library_folder_path" ON "library_folder" USING btree ("library_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "title_library_path" ON "title" USING btree ("library_id","path");--> statement-breakpoint
CREATE INDEX "title_sort_idx" ON "title" USING btree ("library_id","sort_name");--> statement-breakpoint
CREATE INDEX "title_added_idx" ON "title" USING btree ("library_id","added_at");--> statement-breakpoint
CREATE INDEX "title_genres_idx" ON "title" USING gin ("genres");--> statement-breakpoint
CREATE INDEX "title_studios_idx" ON "title" USING gin ("studios");--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_library_path" ON "media_item" USING btree ("library_id","path");--> statement-breakpoint
CREATE INDEX "media_item_title_idx" ON "media_item" USING btree ("library_id","title");--> statement-breakpoint
CREATE INDEX "media_item_title_id_idx" ON "media_item" USING btree ("title_id","season_number","episode_number");--> statement-breakpoint
CREATE INDEX "media_item_unprobed_idx" ON "media_item" USING btree ("library_id") WHERE "media_item"."probed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "subtitle_file_item_path" ON "subtitle_file" USING btree ("media_item_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_lower" ON "user" USING btree (lower("username"));