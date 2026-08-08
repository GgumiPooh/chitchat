-- INFO: REQUIREMENTS.md § 8.13. NULL is "never edited", and the CHECK keeps the column on the one type that has prose to correct.
ALTER TABLE "messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 8.13.1. The resume reconciliation reads exactly this predicate; partial, because an edit or a delete is rare beside the rows it is indexed out of.
CREATE INDEX "messages_changed_id_idx" ON "messages" USING btree ("id") WHERE "deleted_at" IS NOT NULL OR "edited_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_edited_is_text_check" CHECK ("edited_at" IS NULL OR "type" = 'text');--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 8.13. One channel and one `change` event for both mutations — the stream reads the row back either way, and the row's own `deleted_at` (as `isDeleted` on the wire) is what tells them apart.
CREATE OR REPLACE FUNCTION notify_message_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('message_changed', json_build_object('id', NEW.id)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- WARN: REQUIREMENTS.md § 6. `messages` is otherwise append-only, so the WHEN clause is what keeps this trigger off any UPDATE a later feature adds.
-- WARN: `IS DISTINCT FROM`, never `<>` — both columns are nullable and `<>` answers NULL there, which the WHEN clause reads as false.
CREATE OR REPLACE TRIGGER messages_notify_changed
AFTER UPDATE OF "edited_at", "deleted_at" ON "messages"
FOR EACH ROW
WHEN (OLD."edited_at" IS DISTINCT FROM NEW."edited_at" OR OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at")
EXECUTE FUNCTION notify_message_changed();
