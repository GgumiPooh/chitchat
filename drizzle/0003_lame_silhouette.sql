DROP INDEX "media_created_at_idx";--> statement-breakpoint
ALTER TABLE "conversation_members" ALTER COLUMN "last_read_at" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "media_created_at_id_idx" ON "media" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "message_media_media_id_idx" ON "message_media" USING btree ("media_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_singleton_check" CHECK ("id" = '00000000-0000-4000-8000-000000000001'::uuid);