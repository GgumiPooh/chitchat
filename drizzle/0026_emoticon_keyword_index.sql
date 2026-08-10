CREATE TABLE "emoticon_keywords" (
	"item_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	CONSTRAINT "emoticon_keywords_item_id_keyword_pk" PRIMARY KEY("item_id","keyword")
);
--> statement-breakpoint
-- WARN: REQUIREMENTS.md § 13.9.1. `ON DELETE cascade` is also the *whole* of the delete half of the sync below — an item losing its rows needs no trigger, and one written anyway would fire after the constraint had already removed them.
ALTER TABLE "emoticon_keywords" ADD CONSTRAINT "emoticon_keywords_item_id_emoticon_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 13.9.1. The reverse direction, `term LIKE '%keyword%'` inverted into an equality probe against the term's own substrings — the one form of that test an index can answer.
CREATE INDEX "emoticon_keywords_keyword_idx" ON "emoticon_keywords" USING btree ("keyword");--> statement-breakpoint
-- INFO: REQUIREMENTS.md § 13.9.1. The forward direction, `keyword ILIKE '%term%'`. Hand-written for the reason `messages_text_trgm_idx` is (`0002_message_search_and_notify.sql`): drizzle-kit does not model an operator class, and `pg_trgm` is already installed by that migration.
CREATE INDEX "emoticon_keywords_keyword_trgm_idx" ON "emoticon_keywords" USING gin ("keyword" gin_trgm_ops);--> statement-breakpoint
-- WARN: REQUIREMENTS.md § 13.9.1. A trigger rather than app code, because `write-emoticon-item.ts` exists in both repositories — maintained in the app this would be two copies of one write, and the index would drift silently the first time only one of them was fixed.
-- WARN: `>= 2` is `MIN_KEYWORD_LENGTH` and `<= 20` is `MAX_EMOTICON_KEYWORD_LENGTH`, both restated because SQL cannot read them. Together they are what makes the reverse probe *exact*: substrings are generated between exactly those lengths, so a stored keyword outside them would be unreachable by the direction that matches most widely.
-- WARN: The upper bound is a filter for the same reason the lower one is — `normalizeKeywords` slices to twenty but guards only `write-emoticon-item.ts`, so a row older than that rule can carry a longer keyword and no substring the probe enumerates would ever equal it.
-- WARN: `ON CONFLICT DO NOTHING` covers two authored keywords that fold to the same string. `normalizeKeywords` dedups case-insensitively so the app cannot write such a pair, but a row older than that rule can hold one — and here the difference is between an index that rebuilds and an item edit that aborts.
CREATE OR REPLACE FUNCTION sync_emoticon_keywords() RETURNS trigger AS $$
BEGIN
  DELETE FROM emoticon_keywords WHERE item_id = NEW.id;

  INSERT INTO emoticon_keywords (item_id, keyword)
  SELECT NEW.id, lower(word.keyword)
  FROM unnest(NEW.keywords) AS word(keyword)
  WHERE char_length(word.keyword) BETWEEN 2 AND 20
  ON CONFLICT DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER emoticon_items_sync_keywords_insert
AFTER INSERT ON "emoticon_items"
FOR EACH ROW
EXECUTE FUNCTION sync_emoticon_keywords();
--> statement-breakpoint
-- WARN: `UPDATE OF "keywords"` plus `IS DISTINCT FROM`, so § 13.4.'s asset edit — which rewrites the row without touching this column — does not delete and reinsert the item's index rows on every save.
CREATE OR REPLACE TRIGGER emoticon_items_sync_keywords_update
AFTER UPDATE OF "keywords" ON "emoticon_items"
FOR EACH ROW
WHEN (OLD."keywords" IS DISTINCT FROM NEW."keywords")
EXECUTE FUNCTION sync_emoticon_keywords();
--> statement-breakpoint
-- WARN: The same two bounds as the trigger, and they are a filter rather than a check. `normalizeKeywords` guards only the two write paths in `write-emoticon-item.ts`, so a row authored before that rule may sit outside either end — dropped here, since the reverse probe's exactness rests on every indexed keyword clearing both.
INSERT INTO emoticon_keywords (item_id, keyword)
SELECT items.id, lower(word.keyword)
FROM emoticon_items AS items, unnest(items.keywords) AS word(keyword)
WHERE char_length(word.keyword) BETWEEN 2 AND 20
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- WARN: REQUIREMENTS.md § 13.9.1. A table created and filled inside one migration has `relpages = 0` until autovacuum reaches it, so the planner costs both arms off its defaults — which is a stretch of wrong plans starting at the moment of deploy, on the search's hottest path. `ANALYZE` is transactional (unlike `VACUUM`) and safe to run here.
ANALYZE emoticon_keywords;
