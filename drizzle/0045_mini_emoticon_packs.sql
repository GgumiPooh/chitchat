CREATE TYPE "public"."emoticon_pack_type" AS ENUM('emoticon', 'mini');--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD COLUMN "type" "emoticon_pack_type" DEFAULT 'emoticon' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "inline_emoticon_item_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_inline_emoticons_are_text_check" CHECK ("type" = 'text' OR cardinality("inline_emoticon_item_ids") = 0);--> statement-breakpoint
-- WARN: REQUIREMENTS.md § 13. A mini's keyword is the name it is managed under rather than something to search for, so it is kept out of the index here instead of filtered by the readers — `0026_emoticon_keyword_index.sql` chose a trigger because both repositories query this table, and a filter added to the queries would be the two copies that argument rules out.
-- WARN: The pack's type is fixed at creation. A statement that changed it would leave these rows behind, since nothing on `emoticon_packs` fires this.
CREATE OR REPLACE FUNCTION sync_emoticon_keywords() RETURNS trigger AS $$
BEGIN
  DELETE FROM emoticon_keywords WHERE item_id = NEW.id;

  INSERT INTO emoticon_keywords (item_id, keyword)
  SELECT NEW.id, lower(word.keyword)
  FROM unnest(NEW.keywords) AS word(keyword)
  WHERE char_length(word.keyword) BETWEEN 2 AND 20
    AND (SELECT packs.type FROM emoticon_packs AS packs WHERE packs.id = NEW.pack_id) = 'emoticon'
  ON CONFLICT DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- INFO: The rebuild the condition above needs. A full one rather than a delete of the mini rows, so the index is level with the function as written whatever it held before.
DELETE FROM emoticon_keywords;--> statement-breakpoint
INSERT INTO emoticon_keywords (item_id, keyword)
SELECT items.id, lower(word.keyword)
FROM emoticon_items AS items
JOIN emoticon_packs AS packs ON packs.id = items.pack_id
CROSS JOIN LATERAL unnest(items.keywords) AS word(keyword)
WHERE packs.type = 'emoticon'
  AND char_length(word.keyword) BETWEEN 2 AND 20
ON CONFLICT DO NOTHING;