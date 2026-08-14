ALTER TABLE "emoticon_packs" DROP CONSTRAINT "emoticon_packs_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "emoticon_packs" DROP COLUMN "created_by";