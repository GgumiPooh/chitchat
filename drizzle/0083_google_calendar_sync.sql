ALTER TYPE "public"."event_recurrence" ADD VALUE IF NOT EXISTS 'daily';--> statement-breakpoint
ALTER TYPE "public"."event_recurrence" ADD VALUE IF NOT EXISTS 'custom';--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."event_source" AS ENUM('jandh', 'google');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurrence_until" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "rrule" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "exdates" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "source" "public"."event_source" DEFAULT 'jandh' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_read_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "i_cal_uid" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_i_cal_uid_idx" ON "events" USING btree ("i_cal_uid");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_accounts" (
	"user_id" bigint PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"google_email" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"encrypted_access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"default_calendar_id" text DEFAULT 'primary' NOT NULL,
	"calendar_list_sync_token" text,
	"initial_export_done" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"syncing_until" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_sources" (
	"user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"calendar_id" text NOT NULL,
	"summary" text NOT NULL,
	"background_color" text,
	"access_role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_token" text,
	"last_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_sources_user_id_calendar_id_pk" PRIMARY KEY("user_id","calendar_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_google_links" (
	"event_id" bigint NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"calendar_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"etag" text,
	"recurring_master_google_id" text,
	"original_start_key" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_google_links_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_google_links_lookup_idx" ON "event_google_links" USING btree ("user_id","calendar_id","google_event_id");
