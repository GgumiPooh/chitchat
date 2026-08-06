ALTER TABLE "users" ADD COLUMN "profile_background_media_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_background_media_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_background_media_id_media_id_fk" FOREIGN KEY ("profile_background_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_chat_background_media_id_media_id_fk" FOREIGN KEY ("chat_background_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;