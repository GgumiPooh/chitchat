-- REQUIREMENTS.md § 16.3. Per-event reminder switch; existing rows keep receiving.
ALTER TABLE "events" ADD COLUMN "reminder_enabled" boolean DEFAULT true NOT NULL;