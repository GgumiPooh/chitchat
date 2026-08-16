CREATE TABLE "storage_reservations" (
	"r2_key" text PRIMARY KEY NOT NULL,
	"owner_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"r2_purged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "r2_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_reservations" ADD CONSTRAINT "storage_reservations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_reservations_expires_at_idx" ON "storage_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "media_pending_purge_idx" ON "media" USING btree ("deleted_at") WHERE "deleted_at" IS NOT NULL AND "r2_purged_at" IS NULL;