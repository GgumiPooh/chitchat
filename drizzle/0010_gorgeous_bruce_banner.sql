ALTER TABLE "emoticon_items" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "mime" text NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "animated_key" text;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "animated_mime" text;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "audio_key" text;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "audio_mime" text;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD COLUMN "created_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD COLUMN "thumbnail_item_id" uuid;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD CONSTRAINT "emoticon_packs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD CONSTRAINT "emoticon_packs_thumbnail_item_id_emoticon_items_id_fk" FOREIGN KEY ("thumbnail_item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emoticon_items_pack_id_sort_order_idx" ON "emoticon_items" USING btree ("pack_id","sort_order");--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD CONSTRAINT "emoticon_items_animated_key_unique" UNIQUE("animated_key");--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD CONSTRAINT "emoticon_items_audio_key_unique" UNIQUE("audio_key");