-- WARN: REQUIREMENTS.md § 13.9.1. The keyword index was kept level by `ON DELETE cascade` alone, and `0049` left every delete an `UPDATE`, so the rows outlived the items they describe.
-- INFO: The insert is skipped for a deleted row rather than the delete being conditional, so one function still answers all three triggers.
CREATE OR REPLACE FUNCTION sync_emoticon_keywords() RETURNS trigger AS $$
BEGIN
  DELETE FROM emoticon_keywords WHERE item_id = NEW.id;

  IF NEW.deleted_at IS NULL THEN
    INSERT INTO emoticon_keywords (item_id, keyword)
    SELECT NEW.id, lower(word.keyword)
    FROM unnest(NEW.keywords) AS word(keyword)
    WHERE char_length(word.keyword) BETWEEN 2 AND 20
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- WARN: `UPDATE OF "deleted_at"` and not a bare `UPDATE`, for the reason § 13.4.'s asset edit gives on the keywords trigger beside it — a row rewritten without touching this column must not rebuild its index rows.
CREATE OR REPLACE TRIGGER emoticon_items_sync_keywords_delete
AFTER UPDATE OF "deleted_at" ON "emoticon_items"
FOR EACH ROW
WHEN (OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at")
EXECUTE FUNCTION sync_emoticon_keywords();--> statement-breakpoint
-- INFO: Every item soft-deleted before the trigger above existed — `0049`'s backfill, and every mini deleted under § 13.4.'s original tombstone path.
DELETE FROM emoticon_keywords
  WHERE item_id IN (SELECT "id" FROM "emoticon_items" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
-- WARN: § 13.2. `thumbnail_item_id`'s `ON DELETE SET NULL` was what fell a pack back on its first item, and a soft delete never fires it — so a pack whose 대표 was deleted kept requesting a purged object.
UPDATE "emoticon_packs" p
  SET "thumbnail_item_id" = NULL
  WHERE p."thumbnail_item_id" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "emoticon_items" ei
      WHERE ei."id" = p."thumbnail_item_id" AND ei."deleted_at" IS NOT NULL
    );
