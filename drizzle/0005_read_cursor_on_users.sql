-- REQUIREMENTS.md § 6. `conversation_members` collapses into `users`: the allow-list keeps membership and identity the same set, so the join only ever cost a hop.
-- WARN: Three statements, not one `ADD COLUMN ... NOT NULL` — that form needs a default, and a default of `now()` is exactly what § 8.8. forbids. Backfill, then constrain.
ALTER TABLE "users" ADD COLUMN "last_read_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "last_read_at" = COALESCE(
  (SELECT "cm"."last_read_at" FROM "conversation_members" "cm" WHERE "cm"."user_id" = "users"."id"),
  TIMESTAMPTZ '1970-01-01 00:00:00+00'
);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_read_at" SET NOT NULL;--> statement-breakpoint
DROP TABLE "conversation_members" CASCADE;--> statement-breakpoint
-- REQUIREMENTS.md § 8.4. The second SSE channel. A read-cursor bump and a nickname or avatar change are the same event now, so one channel serves § 8.7. and § 8.8.
-- INFO: No payload — § 8.4. refetches the whole user set over `GET /api/users` rather than trusting the notification, so there is nothing an id would save.
CREATE OR REPLACE FUNCTION notify_user_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('user_changed', '');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE TRIGGER users_notify_insert
AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION notify_user_changed();--> statement-breakpoint
-- WARN: Split from the INSERT trigger because a `WHEN` clause cannot reference OLD on an INSERT, and without the guard every no-op UPDATE wakes both clients.
CREATE OR REPLACE TRIGGER users_notify_update
AFTER UPDATE ON "users"
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION notify_user_changed();
