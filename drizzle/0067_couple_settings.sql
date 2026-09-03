-- REQUIREMENTS.md § 12.2., § 11.1. The wallpaper table becomes couple-level: the wallpaper is also drawn under the calendar's D-day card, and the table now carries the relationship start date and login order. Renamed rather than dropped and recreated — production has data.
ALTER TABLE "chat_settings" RENAME TO "couple_settings";--> statement-breakpoint
ALTER TABLE "couple_settings" RENAME CONSTRAINT "chat_settings_singleton_check" TO "couple_settings_singleton_check";--> statement-breakpoint
ALTER TABLE "couple_settings" RENAME CONSTRAINT "chat_settings_background_media_id_media_id_fk" TO "couple_settings_background_media_id_media_id_fk";--> statement-breakpoint
ALTER TRIGGER "chat_settings_notify_insert" ON "couple_settings" RENAME TO "couple_settings_notify_insert";--> statement-breakpoint
ALTER TRIGGER "chat_settings_notify_update" ON "couple_settings" RENAME TO "couple_settings_notify_update";--> statement-breakpoint
-- REQUIREMENTS.md § 11.1. Replaces the RELATIONSHIP_START_DATE env var with a row; added nullable so the ALTER cannot fail on the existing singleton row, then backfilled and closed.
ALTER TABLE "couple_settings" ADD COLUMN "start_date" date;--> statement-breakpoint
UPDATE "couple_settings" SET "start_date" = '2024-04-26';--> statement-breakpoint
ALTER TABLE "couple_settings" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "couple_settings" ALTER COLUMN "start_date" SET DEFAULT '2024-04-26';--> statement-breakpoint
ALTER TABLE "couple_settings" ADD COLUMN "first_user_id" bigint;--> statement-breakpoint
ALTER TABLE "couple_settings" ADD COLUMN "second_user_id" bigint;--> statement-breakpoint
ALTER TABLE "couple_settings" ADD CONSTRAINT "couple_settings_first_user_id_users_id_fk" FOREIGN KEY ("first_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_settings" ADD CONSTRAINT "couple_settings_second_user_id_users_id_fk" FOREIGN KEY ("second_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- INFO: Snowflakes are creation-ordered, so `users.id ASC` recovers login order with no timestamp column.
UPDATE "couple_settings"
SET
  "first_user_id" = (SELECT "id" FROM "users" ORDER BY "id" ASC LIMIT 1),
  "second_user_id" = (SELECT "id" FROM "users" ORDER BY "id" ASC OFFSET 1 LIMIT 1);--> statement-breakpoint
-- REQUIREMENTS.md § 6., § 11.1. Moves the login-order fill from `upsertGoogleUser` into the database: an app-side UPDATE left the slot empty forever if the process died between the INSERT and it, and named the one path that inserts a user rather than the table.
-- WARN: One UPDATE, exactly like the seed above, so two concurrent first logins cannot both claim the first slot.
CREATE OR REPLACE FUNCTION fill_couple_settings() RETURNS trigger AS $$
BEGIN
  UPDATE "couple_settings"
  SET
    "first_user_id" = COALESCE("first_user_id", NEW.id),
    "second_user_id" = CASE
      WHEN "first_user_id" IS NOT NULL AND "first_user_id" != NEW.id AND "second_user_id" IS NULL
      THEN NEW.id
      ELSE "second_user_id"
    END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE TRIGGER users_fill_couple_settings
AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION fill_couple_settings();
