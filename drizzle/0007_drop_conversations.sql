-- REQUIREMENTS.md § 6. One conversation, addressed by a constant, queried by nobody — the singleton table and the FK column it existed to anchor both go.
-- WARN: REQUIREMENTS.md § 6. Destructive — sends fail with "23502" between the deploy and this migration, and that window is accepted rather than split.
-- WARN: The function must lose "NEW.conversation_id" before the column does; plpgsql resolves field references at execution, so the reverse order leaves every INSERT failing in the trigger.
CREATE OR REPLACE FUNCTION notify_new_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('new_message', json_build_object('id', NEW.id)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 8.2. Redundant once the leading column is a constant — the primary key on "id" is the paging index.
DROP INDEX IF EXISTS "messages_conversation_id_id_idx";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "conversation_id";--> statement-breakpoint
DROP TABLE "conversations";
