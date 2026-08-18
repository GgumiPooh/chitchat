CREATE TABLE "user_emoticon_usage" (
	"user_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	"use_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_emoticon_usage_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "user_emoticon_usage" ADD CONSTRAINT "user_emoticon_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emoticon_usage" ADD CONSTRAINT "user_emoticon_usage_item_id_emoticon_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_emoticon_usage_user_id_use_count_idx" ON "user_emoticon_usage" USING btree ("user_id","use_count" desc,"last_used_at" desc);--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 13.9.2. Records emoticon usage per user automatically on new emoticon messages.
CREATE OR REPLACE FUNCTION record_user_emoticon_usage() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'emoticon' AND NEW.emoticon_item_id IS NOT NULL THEN
    INSERT INTO user_emoticon_usage (user_id, item_id, use_count, last_used_at)
    VALUES (NEW.sender_id, NEW.emoticon_item_id, 1, clock_timestamp())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET
      use_count = user_emoticon_usage.use_count + 1,
      last_used_at = clock_timestamp();
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER messages_record_emoticon_usage
AFTER INSERT ON "messages"
FOR EACH ROW
WHEN (NEW.type = 'emoticon' AND NEW.emoticon_item_id IS NOT NULL)
EXECUTE FUNCTION record_user_emoticon_usage();
--> statement-breakpoint
-- INFO: Backfill existing emoticon usage history from messages.
INSERT INTO user_emoticon_usage (user_id, item_id, use_count, last_used_at)
SELECT sender_id, emoticon_item_id, count(*)::integer, max(now())
FROM messages
WHERE type = 'emoticon' AND emoticon_item_id IS NOT NULL
GROUP BY sender_id, emoticon_item_id
ON CONFLICT DO NOTHING;
