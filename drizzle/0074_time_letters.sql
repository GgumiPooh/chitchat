CREATE TYPE "public"."letter_status" AS ENUM('scheduled', 'delivering', 'sent', 'canceled');
--> statement-breakpoint
ALTER TYPE "public"."system_action" ADD VALUE 'time_letter_delivered';
--> statement-breakpoint
CREATE TABLE "time_letters" (
	"id" bigint PRIMARY KEY NOT NULL,
	"sender_id" bigint NOT NULL REFERENCES "users"("id"),
	"recipient_id" bigint REFERENCES "users"("id"),
	"title" text,
	"content" text NOT NULL,
	"theme" text DEFAULT 'classic' NOT NULL,
	"status" "letter_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"show_teaser" boolean DEFAULT false NOT NULL,
	"only_me" boolean DEFAULT false NOT NULL,
	"delivered_message_id" bigint REFERENCES "messages"("id") ON DELETE SET NULL,
	"retry_count" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "time_letters_dispatch_idx" ON "time_letters" ("scheduled_at") WHERE "status" = 'scheduled';
--> statement-breakpoint
CREATE INDEX "time_letters_sent_idx" ON "time_letters" ("sent_at") WHERE "status" = 'sent';
--> statement-breakpoint
CREATE INDEX "time_letters_sender_idx" ON "time_letters" ("sender_id", "status");
--> statement-breakpoint
CREATE TABLE "letter_media" (
	"letter_id" bigint NOT NULL REFERENCES "time_letters"("id") ON DELETE CASCADE,
	"media_id" bigint NOT NULL REFERENCES "media"("id"),
	"sort_order" smallint NOT NULL,
	PRIMARY KEY ("letter_id", "sort_order")
);
--> statement-breakpoint
CREATE INDEX "letter_media_media_id_idx" ON "letter_media" ("media_id");
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_scope_check";
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_scope_check" CHECK ("scope" in ('chat', 'avatar', 'background', 'emoticon', 'voca', 'letter'));
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
      ("system_action"::text = 'time_letter_delivered' AND "text" IS NOT NULL AND "event_id" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL)
      OR
      ("system_action" IS NOT NULL AND "system_action"::text NOT IN ('assistant_reply', 'voca_completed', 'time_letter_delivered') AND "text" IS NULL AND "event_title" IS NOT NULL AND "event_starts_at" IS NOT NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL)
    )
  END
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_system_no_reply_check";
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_system_no_reply_check" CHECK ("type" <> 'system' OR "system_action"::text IN ('assistant_reply', 'time_letter_delivered') OR "reply_to_id" IS NULL);
