ALTER TABLE "users" DROP CONSTRAINT "users_chat_background_media_id_media_id_fk";
--> statement-breakpoint
DROP INDEX "media_created_at_id_idx";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "emoticon_packs" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "taken_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "gallery_added_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "gallery_hidden_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "chat_background_media_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "created_at";