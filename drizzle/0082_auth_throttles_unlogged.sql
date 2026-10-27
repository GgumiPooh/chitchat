CREATE UNLOGGED TABLE IF NOT EXISTS "auth_throttles" (
	"key" text PRIMARY KEY,
	"failed_attempts" integer DEFAULT 1 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_throttles_locked_until_idx" ON "auth_throttles" USING btree ("locked_until");
