ALTER TYPE "public"."system_action" ADD VALUE 'voca_completed';
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_type_payload_check";
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_type_payload_check" CHECK (
  CASE "type"
    WHEN 'text' THEN "text" IS NOT NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
    WHEN 'media' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
    WHEN 'emoticon' THEN "text" IS NULL AND "emoticon_item_id" IS NOT NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
    WHEN 'system' THEN "emoticon_item_id" IS NULL AND (
      ("system_action"::text = 'assistant_reply' AND "text" IS NOT NULL AND "event_id" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NOT NULL AND "llm_model" IS NOT NULL)
      OR
      ("system_action"::text = 'voca_completed' AND "text" IS NOT NULL AND "event_id" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL)
      OR
      ("system_action" IS NOT NULL AND "system_action"::text NOT IN ('assistant_reply', 'voca_completed') AND "text" IS NULL AND "event_title" IS NOT NULL AND "event_starts_at" IS NOT NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL)
    )
  END
);
