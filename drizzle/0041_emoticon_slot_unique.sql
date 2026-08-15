ALTER TABLE "emoticon_items" ALTER COLUMN "r2_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ALTER COLUMN "mime" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "emoticon_items_still_image_id_idx" ON "emoticon_items" USING btree ("still_image_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emoticon_items_animated_image_id_idx" ON "emoticon_items" USING btree ("animated_image_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emoticon_items_audio_id_idx" ON "emoticon_items" USING btree ("audio_id");