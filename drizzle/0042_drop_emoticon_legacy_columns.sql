ALTER TABLE "emoticon_items" DROP CONSTRAINT "emoticon_items_r2_key_unique";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP CONSTRAINT "emoticon_items_audio_key_unique";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "r2_key";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "mime";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "audio_key";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "audio_mime";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "height";