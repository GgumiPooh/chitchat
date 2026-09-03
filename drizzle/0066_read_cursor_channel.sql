-- REQUIREMENTS.md § 8.8. The read cursor gets its own channel, carrying the cursor in the payload — a bump and a profile/background change are no longer the same event.
-- INFO: `to_jsonb(row) - 'last_read_message_id'` is every other column as one document, so the second test needs no column list to maintain; an UPDATE moving both fires both.
CREATE OR REPLACE FUNCTION notify_user_row_changed() RETURNS trigger AS $$
BEGIN
  IF OLD.last_read_message_id IS DISTINCT FROM NEW.last_read_message_id THEN
    PERFORM pg_notify(
      'read_cursor',
      json_build_object('userId', NEW.id::text, 'lastReadMessageId', NEW.last_read_message_id::text)::text
    );
  END IF;

  IF (to_jsonb(OLD) - 'last_read_message_id') IS DISTINCT FROM (to_jsonb(NEW) - 'last_read_message_id') THEN
    PERFORM pg_notify('user_changed', '');
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- WARN: The INSERT trigger stays on `notify_user_changed` — a fresh row's cursor is always null, so it has nothing a `read_cursor` event could report, and the `WHEN` guard below cannot reference OLD on an INSERT anyway.
CREATE OR REPLACE TRIGGER users_notify_update
AFTER UPDATE ON "users"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION notify_user_row_changed();
