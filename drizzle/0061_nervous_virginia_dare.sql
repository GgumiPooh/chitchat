ALTER TABLE "media" RENAME COLUMN "ai_expires_at" TO "expires_at";--> statement-breakpoint
DROP INDEX "media_ai_expiry_idx";--> statement-breakpoint
CREATE INDEX "media_expiry_idx" ON "media" USING btree ("expires_at") WHERE "expires_at" IS NOT NULL AND "deleted_at" IS NULL;