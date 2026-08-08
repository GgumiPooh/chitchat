-- REQUIREMENTS.md § 12.2. The chat wallpaper stops being a `users` column and becomes conversation-wide. One row, pinned by the CHECK — see § 6. for why this is not the `conversations` table that section refuses.
CREATE TABLE "chat_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"background_media_id" uuid,
	CONSTRAINT "chat_settings_singleton_check" CHECK ("chat_settings"."id")
);
--> statement-breakpoint
ALTER TABLE "chat_settings" ADD CONSTRAINT "chat_settings_background_media_id_media_id_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- INFO: The one row, seeded here and never inserted again — the PK and the CHECK together leave `true` as the only key it can take.
-- WARN: Both participants may have had a wallpaper of their own, and only one survives the move to a shared value. The earliest account wins, which is arbitrary but deterministic; the loser's object is left in R2 for `discardScopedMedia` to never reach, and is dropped with the column two migrations later.
INSERT INTO "chat_settings" ("id", "background_media_id")
VALUES (
  true,
  (
    SELECT "chat_background_media_id"
    FROM "users"
    WHERE "chat_background_media_id" IS NOT NULL
    ORDER BY "created_at" ASC
    LIMIT 1
  )
)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- REQUIREMENTS.md § 8.4. Published on `user_changed` rather than a channel of its own. The client answers that event by refetching the whole participant payload, and § 12.2. now ships the shared wallpaper inside it — so a new channel would buy a second listener and a second request for a payload this one already carries.
-- WARN: Two triggers, exactly as `users` has: a `WHEN` clause cannot reference OLD on an INSERT, so the no-op guard rides the UPDATE alone.
-- INFO: The INSERT trigger is not dead weight. The statement above seeds the row, but `writeChatBackground` re-creates it if it is ever missing (a restore, a hand-run DELETE) rather than failing every save forever — and that write must reach the other participant like any other.
CREATE OR REPLACE TRIGGER chat_settings_notify_insert
AFTER INSERT ON "chat_settings"
FOR EACH ROW EXECUTE FUNCTION notify_user_changed();--> statement-breakpoint
CREATE OR REPLACE TRIGGER chat_settings_notify_update
AFTER UPDATE ON "chat_settings"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION notify_user_changed();
