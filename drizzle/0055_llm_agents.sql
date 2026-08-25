CREATE TABLE "llm_agents" (
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"api_key" text NOT NULL,
	"priority" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"disabled_until" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "llm_agents_provider_model_api_key_pk" PRIMARY KEY("provider","model","api_key")
);
--> statement-breakpoint
-- WARN: `IF EXISTS` because 0030 replaced `emoticon_item_id` / `event_id` / `reply_to_id`, and dropping those columns took both CHECKs that named them with it — `messages_system_no_reply_check` is restored below for the same reason.
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_type_payload_check";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_system_no_reply_check";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_system_no_reply_check" CHECK ("type" <> 'system' OR "reply_to_id" IS NULL);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "llm_provider" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "llm_model" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_type_payload_check" CHECK (CASE "type"
        WHEN 'text' THEN "text" IS NOT NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
        WHEN 'media' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
        WHEN 'emoticon' THEN "text" IS NULL AND "emoticon_item_id" IS NOT NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
        WHEN 'system' THEN "emoticon_item_id" IS NULL AND (
          ("system_action"::text = 'assistant_reply' AND "text" IS NOT NULL AND "event_id" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NOT NULL AND "llm_model" IS NOT NULL)
          OR
          ("system_action" IS NOT NULL AND "system_action"::text <> 'assistant_reply' AND "text" IS NULL AND "event_title" IS NOT NULL AND "event_starts_at" IS NOT NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL)
        )
      END);