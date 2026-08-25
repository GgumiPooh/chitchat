DROP INDEX "messages_changed_id_idx";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "collapsed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "messages_changed_id_idx" ON "messages" USING btree ("id") WHERE "deleted_at" IS NOT NULL OR "edited_at" IS NOT NULL OR "collapsed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_collapsed_is_prose_check" CHECK ("collapsed_at" IS NULL OR "type" = 'text' OR "system_action"::text = 'assistant_reply');--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 8.17. Folding rides § 8.13.'s channel whole — it is an UPDATE on a row somebody already has, and the payload is the same `ChatMessage` either way.
-- WARN: `IS DISTINCT FROM` for the new column too, for the reason the two beside it carry.
CREATE OR REPLACE TRIGGER messages_notify_changed
AFTER UPDATE OF "edited_at", "deleted_at", "collapsed_at" ON "messages"
FOR EACH ROW
WHEN (OLD."edited_at" IS DISTINCT FROM NEW."edited_at" OR OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at" OR OLD."collapsed_at" IS DISTINCT FROM NEW."collapsed_at")
EXECUTE FUNCTION notify_message_changed();
