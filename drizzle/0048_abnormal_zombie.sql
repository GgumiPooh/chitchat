ALTER TABLE "users" ADD COLUMN "share_key" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_share_key_unique" UNIQUE("share_key");
