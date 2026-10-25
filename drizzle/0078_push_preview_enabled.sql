ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "preview_enabled" boolean DEFAULT false NOT NULL;
