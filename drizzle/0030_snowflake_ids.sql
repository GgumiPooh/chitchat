-- REQUIREMENTS.md § 6. Every uuid key becomes a 64-bit snowflake, and `messages.id` leaves its sequence for the same layout: `43 bits ms | 10 bits machine | 10 bits sequence`, epoch 1990-01-01 UTC.
-- WARN: Hand-written. `drizzle-kit generate` emits a bare `SET DATA TYPE bigint`, which Postgres refuses on uuid data — the snapshot beside this file is the generated one so `db:generate` stays quiet, but the statements are not.
-- WARN: There is no safe deploy order for this one (§ 6. migration rules): both the previous build and the new one break against the other's column types, so it runs with the site down and both deployments shipped immediately after.
-- INFO: Machine bits are `0` throughout. Every id minted here carries a timestamp already in the past, and the app mints only from `Date.now()`, so the two ranges cannot meet however the app's per-process number is drawn.

-- WARN: The epoch guard is 2021 rather than 1990. `(ms - epoch) << 20` only reaches 19 digits about 30 years past the epoch, and "every id is the same width" is what keeps a stray `>` from ordering ids wrongly (`compareId`).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT min(created_at) AS oldest FROM "users"
      UNION ALL SELECT min(created_at) FROM "media"
      UNION ALL SELECT min(created_at) FROM "events"
      UNION ALL SELECT min(created_at) FROM "sessions"
      UNION ALL SELECT min(created_at) FROM "push_subscriptions"
      UNION ALL SELECT min(created_at) FROM "emoticon_packs"
      UNION ALL SELECT min(created_at) FROM "emoticon_items"
      UNION ALL SELECT min(created_at) FROM "messages"
    ) t WHERE t.oldest < timestamptz '2021-01-01'
  ) THEN
    RAISE EXCEPTION 'a row predates the snowflake epoch window; ids would not all be 19 digits';
  END IF;
END $$;--> statement-breakpoint

-- WARN: The 10-bit sequence field holds 1024 ids per millisecond. `created_at` defaults to the *transaction* timestamp, so one multi-photo send shares a millisecond — far under the cap, but a bucket that overflowed would carry into the machine field and mint ids a future generator can repeat.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','media','events','sessions','push_subscriptions','emoticon_packs','emoticon_items','messages'] LOOP
    EXECUTE format(
      'SELECT 1 FROM %I GROUP BY (extract(epoch FROM created_at) * 1000)::bigint HAVING count(*) > 1024 LIMIT 1', t
    );
    IF FOUND THEN
      RAISE EXCEPTION '%: more than 1024 rows share one millisecond', t;
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "id_new" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "id_new" bigint;--> statement-breakpoint

UPDATE "users" u SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "users") t
) x WHERE u.id = x.id;--> statement-breakpoint

-- WARN: REQUIREMENTS.md § 9. The R2 keys are `{scope}/{ownerId}/{object}` and `emoticon_items` carries no owner column, so the uploader in an emoticon key can only be read back through this map. `scripts/migrate-r2-keys.ts` consumes it, and a later migration of its own drops it once every object has moved — **not one written beside this file**, since `pnpm db:migrate` applies every pending file in one go and would erase the map before the script ran (§ 6.).
CREATE TABLE "snowflake_user_id_map" ("old_id" uuid PRIMARY KEY, "new_id" bigint NOT NULL);--> statement-breakpoint
INSERT INTO "snowflake_user_id_map" ("old_id", "new_id") SELECT "id", "id_new" FROM "users";--> statement-breakpoint

UPDATE "media" m SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "media") t
) x WHERE m.id = x.id;--> statement-breakpoint

UPDATE "events" e SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "events") t
) x WHERE e.id = x.id;--> statement-breakpoint

UPDATE "sessions" s SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "sessions") t
) x WHERE s.id = x.id;--> statement-breakpoint

UPDATE "push_subscriptions" p SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "push_subscriptions") t
) x WHERE p.id = x.id;--> statement-breakpoint

UPDATE "emoticon_packs" p SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "emoticon_packs") t
) x WHERE p.id = x.id;--> statement-breakpoint

UPDATE "emoticon_items" i SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "emoticon_items") t
) x WHERE i.id = x.id;--> statement-breakpoint

-- WARN: `messages` alone takes a running maximum, and the existing `id` order is the truth it is built on. `created_at` is the *transaction* timestamp, so two overlapping writes can carry timestamps in the opposite order to the ids they were given — mapped straight through, that pair would swap places in the timeline (§ 8.2.).
UPDATE "messages" m SET "id_new" = x.snowflake FROM (
  SELECT id, ((ms - 631152000000) << 20) | (row_number() OVER (PARTITION BY ms ORDER BY id) - 1) AS snowflake
  FROM (
    SELECT id, max(ms) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING) AS ms
    FROM (SELECT id, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM "messages") o
  ) t
) x WHERE m.id = x.id;--> statement-breakpoint

ALTER TABLE "sessions" ADD COLUMN "user_id_new" bigint;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "user_id_new" bigint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "owner_id_new" bigint;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "created_by_new" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD COLUMN "created_by_new" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD COLUMN "thumbnail_item_id_new" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "pack_id_new" bigint;--> statement-breakpoint
ALTER TABLE "emoticon_keywords" ADD COLUMN "item_id_new" bigint;--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ADD COLUMN "user_id_new" bigint;--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ADD COLUMN "pack_id_new" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_media_id_new" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_background_media_id_new" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_background_media_id_new" bigint;--> statement-breakpoint
ALTER TABLE "chat_settings" ADD COLUMN "background_media_id_new" bigint;--> statement-breakpoint
ALTER TABLE "message_media" ADD COLUMN "message_id_new" bigint;--> statement-breakpoint
ALTER TABLE "message_media" ADD COLUMN "media_id_new" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_id_new" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "emoticon_item_id_new" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "event_id_new" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_id_new" bigint;--> statement-breakpoint

UPDATE "sessions" c SET "user_id_new" = u."id_new" FROM "users" u WHERE c."user_id" = u."id";--> statement-breakpoint
UPDATE "push_subscriptions" c SET "user_id_new" = u."id_new" FROM "users" u WHERE c."user_id" = u."id";--> statement-breakpoint
UPDATE "media" c SET "owner_id_new" = u."id_new" FROM "users" u WHERE c."owner_id" = u."id";--> statement-breakpoint
UPDATE "events" c SET "created_by_new" = u."id_new" FROM "users" u WHERE c."created_by" = u."id";--> statement-breakpoint
UPDATE "emoticon_packs" c SET "created_by_new" = u."id_new" FROM "users" u WHERE c."created_by" = u."id";--> statement-breakpoint
UPDATE "user_emoticon_prefs" c SET "user_id_new" = u."id_new" FROM "users" u WHERE c."user_id" = u."id";--> statement-breakpoint
UPDATE "messages" c SET "sender_id_new" = u."id_new" FROM "users" u WHERE c."sender_id" = u."id";--> statement-breakpoint
UPDATE "users" c SET "avatar_media_id_new" = m."id_new" FROM "media" m WHERE c."avatar_media_id" = m."id";--> statement-breakpoint
UPDATE "users" c SET "profile_background_media_id_new" = m."id_new" FROM "media" m WHERE c."profile_background_media_id" = m."id";--> statement-breakpoint
UPDATE "users" c SET "chat_background_media_id_new" = m."id_new" FROM "media" m WHERE c."chat_background_media_id" = m."id";--> statement-breakpoint
UPDATE "chat_settings" c SET "background_media_id_new" = m."id_new" FROM "media" m WHERE c."background_media_id" = m."id";--> statement-breakpoint
UPDATE "message_media" c SET "media_id_new" = m."id_new" FROM "media" m WHERE c."media_id" = m."id";--> statement-breakpoint
UPDATE "message_media" c SET "message_id_new" = m."id_new" FROM "messages" m WHERE c."message_id" = m."id";--> statement-breakpoint
UPDATE "messages" c SET "event_id_new" = e."id_new" FROM "events" e WHERE c."event_id" = e."id";--> statement-breakpoint
UPDATE "messages" c SET "emoticon_item_id_new" = i."id_new" FROM "emoticon_items" i WHERE c."emoticon_item_id" = i."id";--> statement-breakpoint
UPDATE "messages" c SET "reply_to_id_new" = p."id_new" FROM "messages" p WHERE c."reply_to_id" = p."id";--> statement-breakpoint
UPDATE "emoticon_items" c SET "pack_id_new" = p."id_new" FROM "emoticon_packs" p WHERE c."pack_id" = p."id";--> statement-breakpoint
UPDATE "user_emoticon_prefs" c SET "pack_id_new" = p."id_new" FROM "emoticon_packs" p WHERE c."pack_id" = p."id";--> statement-breakpoint
UPDATE "emoticon_packs" c SET "thumbnail_item_id_new" = i."id_new" FROM "emoticon_items" i WHERE c."thumbnail_item_id" = i."id";--> statement-breakpoint
UPDATE "emoticon_keywords" c SET "item_id_new" = i."id_new" FROM "emoticon_items" i WHERE c."item_id" = i."id";--> statement-breakpoint

-- WARN: A remap that missed would blank a nullable reference rather than fail, and the symptom is an avatar that quietly disappears. The FKs make it impossible; the assertion is what makes it *checked*.
DO $$ BEGIN
  IF (SELECT count(*) FROM "users" WHERE ("avatar_media_id" IS NULL) <> ("avatar_media_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "users" WHERE ("profile_background_media_id" IS NULL) <> ("profile_background_media_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "users" WHERE ("chat_background_media_id" IS NULL) <> ("chat_background_media_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "chat_settings" WHERE ("background_media_id" IS NULL) <> ("background_media_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "messages" WHERE ("event_id" IS NULL) <> ("event_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "messages" WHERE ("emoticon_item_id" IS NULL) <> ("emoticon_item_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "messages" WHERE ("reply_to_id" IS NULL) <> ("reply_to_id_new" IS NULL)) > 0
    OR (SELECT count(*) FROM "emoticon_packs" WHERE ("thumbnail_item_id" IS NULL) <> ("thumbnail_item_id_new" IS NULL)) > 0
  THEN
    RAISE EXCEPTION 'a nullable reference lost its value in the remap';
  END IF;
END $$;--> statement-breakpoint

-- INFO: Children first, so every foreign key is gone with its own column by the time a parent drops its `id` — no `CASCADE` has to be spelled out, and nothing is dropped that this file does not name.
ALTER TABLE "sessions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "push_subscriptions" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "media" RENAME COLUMN "owner_id_new" TO "owner_id";--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "created_by_new" TO "created_by";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_packs" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "emoticon_packs" RENAME COLUMN "created_by_new" TO "created_by";--> statement-breakpoint
ALTER TABLE "emoticon_packs" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_packs" DROP COLUMN "thumbnail_item_id";--> statement-breakpoint
ALTER TABLE "emoticon_packs" RENAME COLUMN "thumbnail_item_id_new" TO "thumbnail_item_id";--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "pack_id";--> statement-breakpoint
ALTER TABLE "emoticon_items" RENAME COLUMN "pack_id_new" TO "pack_id";--> statement-breakpoint
ALTER TABLE "emoticon_items" ALTER COLUMN "pack_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_keywords" DROP COLUMN "item_id";--> statement-breakpoint
ALTER TABLE "emoticon_keywords" RENAME COLUMN "item_id_new" TO "item_id";--> statement-breakpoint
ALTER TABLE "emoticon_keywords" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" DROP COLUMN "pack_id";--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" RENAME COLUMN "pack_id_new" TO "pack_id";--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ALTER COLUMN "pack_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar_media_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "avatar_media_id_new" TO "avatar_media_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "profile_background_media_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "profile_background_media_id_new" TO "profile_background_media_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "chat_background_media_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "chat_background_media_id_new" TO "chat_background_media_id";--> statement-breakpoint
ALTER TABLE "chat_settings" DROP COLUMN "background_media_id";--> statement-breakpoint
ALTER TABLE "chat_settings" RENAME COLUMN "background_media_id_new" TO "background_media_id";--> statement-breakpoint
ALTER TABLE "message_media" DROP COLUMN "media_id";--> statement-breakpoint
ALTER TABLE "message_media" RENAME COLUMN "media_id_new" TO "media_id";--> statement-breakpoint
ALTER TABLE "message_media" ALTER COLUMN "media_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_media" DROP COLUMN "message_id";--> statement-breakpoint
ALTER TABLE "message_media" RENAME COLUMN "message_id_new" TO "message_id";--> statement-breakpoint
ALTER TABLE "message_media" ALTER COLUMN "message_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "sender_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "sender_id_new" TO "sender_id";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "emoticon_item_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "emoticon_item_id_new" TO "emoticon_item_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "event_id_new" TO "event_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "reply_to_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "reply_to_id_new" TO "reply_to_id";--> statement-breakpoint

ALTER TABLE "users" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "media" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "push_subscriptions" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "emoticon_packs" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "emoticon_packs" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "emoticon_packs" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "emoticon_items" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "emoticon_items" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "emoticon_items" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD PRIMARY KEY ("id");--> statement-breakpoint

-- INFO: `messages.id` was the one `bigserial` here. Its sequence is owned by the column and goes with it, so the DROP below is a belt-and-braces for a database where that ownership was ever broken by hand.
ALTER TABLE "messages" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD PRIMARY KEY ("id");--> statement-breakpoint
DROP SEQUENCE IF EXISTS "messages_id_seq";--> statement-breakpoint

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD CONSTRAINT "emoticon_packs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "emoticon_packs" ADD CONSTRAINT "emoticon_packs_thumbnail_item_id_emoticon_items_id_fk" FOREIGN KEY ("thumbnail_item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD CONSTRAINT "emoticon_items_pack_id_emoticon_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."emoticon_packs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "emoticon_keywords" ADD CONSTRAINT "emoticon_keywords_item_id_emoticon_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ADD CONSTRAINT "user_emoticon_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ADD CONSTRAINT "user_emoticon_prefs_pack_id_emoticon_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."emoticon_packs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_background_media_id_media_id_fk" FOREIGN KEY ("profile_background_media_id") REFERENCES "public"."media"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_chat_background_media_id_media_id_fk" FOREIGN KEY ("chat_background_media_id") REFERENCES "public"."media"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "chat_settings" ADD CONSTRAINT "chat_settings_background_media_id_media_id_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."media"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "message_media" ADD CONSTRAINT "message_media_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "message_media" ADD CONSTRAINT "message_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_emoticon_item_id_emoticon_items_id_fk" FOREIGN KEY ("emoticon_item_id") REFERENCES "public"."emoticon_items"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null;--> statement-breakpoint

ALTER TABLE "message_media" ADD CONSTRAINT "message_media_message_id_sort_order_pk" PRIMARY KEY ("message_id","sort_order");--> statement-breakpoint
ALTER TABLE "user_emoticon_prefs" ADD CONSTRAINT "user_emoticon_prefs_user_id_pack_id_pk" PRIMARY KEY ("user_id","pack_id");--> statement-breakpoint
ALTER TABLE "emoticon_keywords" ADD CONSTRAINT "emoticon_keywords_item_id_keyword_pk" PRIMARY KEY ("item_id","keyword");--> statement-breakpoint

-- INFO: § 6. The `id` tiebreaker is what makes the § 10. keyset pair safe on a multi-photo send, whose rows share the transaction timestamp.
CREATE INDEX "media_created_at_id_idx" ON "media" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "message_media_media_id_idx" ON "message_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emoticon_items_pack_id_sort_order_idx" ON "emoticon_items" USING btree ("pack_id","sort_order");--> statement-breakpoint
CREATE INDEX "messages_changed_id_idx" ON "messages" USING btree ("id") WHERE "deleted_at" IS NOT NULL OR "edited_at" IS NOT NULL;--> statement-breakpoint

-- WARN: `NEW.id::text`, and this is the whole reason both functions are rewritten here. A bigint in a JSON *number* is read back by `JSON.parse` as a double, which rounds every snowflake — `getMessage` then asks for a row that does not exist and the stream drops the notification with no error anywhere (§ 8.4.).
CREATE OR REPLACE FUNCTION notify_new_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('new_message', json_build_object('id', NEW.id::text)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_message_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('message_changed', json_build_object('id', NEW.id::text)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
