-- REQUIREMENTS.md § 18. #1. 보관함에서 숨기기 is gone, and a hidden tile is carried over as
-- the delete it now is: the object leaves the shelf, and the bubble it was sent in draws a
-- tombstone. The timestamp is kept rather than stamped with now(), so the row records when
-- the user actually removed it.
UPDATE "media"
  SET "deleted_at" = "archive_hidden_at"
  WHERE "archive_hidden_at" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
-- WARN: § 18. #1. A live message is the only thing that puts a row in 보관함 now, so a
-- library-only upload would survive the drop as a row no screen can reach. It is marked
-- deleted for the same reason — leaving it NULL would state that it is still in the
-- library, which no query would then agree with.
UPDATE "media" m
  SET "deleted_at" = m."archive_added_at"
  WHERE m."archive_added_at" IS NOT NULL
    AND m."deleted_at" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "message_media" mm
      JOIN "messages" ms ON ms."id" = mm."message_id"
      WHERE mm."media_id" = m."id" AND ms."deleted_at" IS NULL
    );--> statement-breakpoint
-- WARN: The R2 objects behind every row above are **not** removed — SQL cannot reach the
-- bucket, and `destroyArchiveMedia` is the only thing that deletes them. They are orphaned
-- bytes until something sweeps them.
ALTER TABLE "media" DROP COLUMN "archive_added_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "archive_hidden_at";
