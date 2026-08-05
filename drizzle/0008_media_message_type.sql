-- REQUIREMENTS.md § 8.1. One bubble may carry photos and videos together, so the type is `media` and `media.mime` is the discriminator.
-- WARN: Hand-written. drizzle-kit's generated form drops and recreates `message_type`, which fails on any existing `image` row and silently breaks the trigger function below, whose DECLARE names the type.
ALTER TYPE "public"."message_type" RENAME VALUE 'image' TO 'media';--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_type_payload_check";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_type_payload_check" CHECK (CASE "type"
        WHEN 'text' THEN "text" IS NOT NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL
        WHEN 'media' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL
        WHEN 'emoticon' THEN "text" IS NULL AND "emoticon_item_id" IS NOT NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL
        WHEN 'system' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "system_action" IS NOT NULL AND "event_title" IS NOT NULL AND "event_starts_at" IS NOT NULL
      END);--> statement-breakpoint
-- REQUIREMENTS.md § 6. The guard from 0004, renamed with the value it guards.
DROP TRIGGER IF EXISTS message_media_parent_is_image ON "message_media";--> statement-breakpoint
DROP FUNCTION IF EXISTS assert_message_media_parent_is_image();--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_message_media_parent_is_media() RETURNS trigger AS $$
DECLARE
  parent_type message_type;
BEGIN
  SELECT "type" INTO parent_type FROM messages WHERE id = NEW.message_id;

  IF parent_type IS DISTINCT FROM 'media' THEN
    RAISE EXCEPTION 'message_media requires a message of type media, got %', parent_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER message_media_parent_is_media
BEFORE INSERT OR UPDATE ON "message_media"
FOR EACH ROW EXECUTE FUNCTION assert_message_media_parent_is_media();
