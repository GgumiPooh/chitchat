ALTER TABLE "emoticon_packs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- REQUIREMENTS.md § 13. 목록에서 내리기 is gone, and a retired item is carried over as the
-- delete it now is. The timestamp is kept rather than stamped with now(), so the row
-- records when the item actually left the picker.
UPDATE "emoticon_items"
  SET "deleted_at" = "retired_at"
  WHERE "retired_at" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
-- WARN: § 13.2. A media row is claimed by at most one item, in at most one of its three
-- slots — each slot column carries its own unique index — so the NOT EXISTS below is a
-- defensive floor rather than a case this data can actually reach: the row is only
-- soft-deleted if no item still standing (deleted_at IS NULL) names it in any slot.
UPDATE "media" m
  SET "deleted_at" = ei."deleted_at"
  FROM "emoticon_items" ei
  WHERE ei."retired_at" IS NOT NULL
    AND m."id" IN (ei."still_image_id", ei."animated_image_id", ei."audio_id")
    AND m."deleted_at" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "emoticon_items" other
      WHERE other."deleted_at" IS NULL
        AND m."id" IN (other."still_image_id", other."animated_image_id", other."audio_id")
    );--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "retired_at";
