ALTER TABLE "users" ALTER COLUMN "last_read_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "still_image_id" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "animated_image_id" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "audio_id" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD CONSTRAINT "emoticon_items_still_image_id_media_id_fk" FOREIGN KEY ("still_image_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD CONSTRAINT "emoticon_items_animated_image_id_media_id_fk" FOREIGN KEY ("animated_image_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD CONSTRAINT "emoticon_items_audio_id_media_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;