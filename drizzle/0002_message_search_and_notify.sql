-- REQUIREMENTS.md § 8.6. Korean attaches particles to nouns, so trigram substring matching replaces tsvector, which has no Korean dictionary on managed Postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_text_trgm_idx" ON "messages" USING gin ("text" gin_trgm_ops);
--> statement-breakpoint
-- REQUIREMENTS.md § 8.4. The SSE stream LISTENs on this channel; the payload stays tiny because NOTIFY caps at 8000 bytes and the stream refetches the row by id.
CREATE OR REPLACE FUNCTION notify_new_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('new_message', json_build_object('id', NEW.id, 'conversationId', NEW.conversation_id)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER messages_notify_new_message
AFTER INSERT ON "messages"
FOR EACH ROW EXECUTE FUNCTION notify_new_message();
