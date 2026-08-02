-- REQUIREMENTS.md § 6. The messages CHECK only sees columns of `messages`, so on its own it cannot stop a non-image message from acquiring `message_media` children.
CREATE OR REPLACE FUNCTION assert_message_media_parent_is_image() RETURNS trigger AS $$
DECLARE
  parent_type message_type;
BEGIN
  SELECT "type" INTO parent_type FROM messages WHERE id = NEW.message_id;

  IF parent_type IS DISTINCT FROM 'image' THEN
    RAISE EXCEPTION 'message_media requires a message of type image, got %', parent_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER message_media_parent_is_image
BEFORE INSERT OR UPDATE ON "message_media"
FOR EACH ROW EXECUTE FUNCTION assert_message_media_parent_is_image();
