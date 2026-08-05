-- REQUIREMENTS.md 13.2. The two image slots collapse into one: an item that carried an animation keeps the animation and drops the still it was standing in for.
UPDATE "emoticon_items" SET "r2_key" = "animated_key", "mime" = "animated_mime" WHERE "animated_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP CONSTRAINT "emoticon_items_animated_key_unique";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "animated_key";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "animated_mime";