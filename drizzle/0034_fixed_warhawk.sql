-- RESTRUCTURE.md § 6. row 1 — "migration A", the pre-deploy half.
--
-- Hand-ordered after `drizzle-kit generate`. The generated file adds `kind` and `scope`
-- as NOT NULL against a populated table and asserts every CHECK before anything has
-- been backfilled, so it cannot run: each column is added nullable here, filled, and
-- only then tightened.
--
-- Nothing is dropped. `taken_at`, `gallery_*`, `created_at` and `last_read_at` are all
-- superseded by columns added below and are removed by migration B, after both
-- deployments are live — REQUIREMENTS.md § 6. rule 1, and the reason `0027`/`0028` are
-- two files.

--> ADD, all nullable

ALTER TABLE "media" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "archive_added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "archive_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emoticon_items" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_read_message_id" bigint;--> statement-breakpoint

-- The geometry has to accept NULL before the sentinel sweep below can write one.
ALTER TABLE "media" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint

--> BACKFILL

-- RESTRUCTURE.md § 2.2. The same order `toMediaKind` applies in `register-media.ts`,
-- and the order is load-bearing rather than cosmetic: `isFileMime` is true for
-- `audio/mp4`, so testing the filename first would file every recording as an
-- attachment. No row carries both a filename and peaks — checked against production
-- before this was written.
UPDATE "media" SET "kind" = CASE
  WHEN "waveform_peaks" IS NOT NULL THEN 'voice'
  WHEN "filename" IS NOT NULL THEN 'file'
  WHEN "mime" LIKE 'video/%' THEN 'video'
  WHEN "mime" LIKE 'audio/%' THEN 'audio'
  ELSE 'image'
END;--> statement-breakpoint

-- RESTRUCTURE.md § 2.3. The scope was already the first segment of every key
-- (`toScopePrefix`), so this reads it back rather than guessing. A key that does not
-- start with one of the four fails `media_scope_check` below, loudly and before the
-- deploy.
UPDATE "media" SET "scope" = split_part("r2_key", '/', 1);--> statement-breakpoint

-- RESTRUCTURE.md § 2.8. Same meaning, a name that is not about to collide with the
-- 갤러리 shelf.
UPDATE "media" SET
  "archive_added_at" = "gallery_added_at",
  "archive_hidden_at" = "gallery_hidden_at";--> statement-breakpoint

-- RESTRUCTURE.md § 3.5. The read cursor becomes the message it always meant. NULL
-- stays NULL by construction — a user who has read nothing has no greatest message
-- behind them, which is the same "everything is unread" `last_read_at` carried by
-- having no default.
UPDATE "users" u SET "last_read_message_id" = (
  SELECT max(m."id") FROM "messages" m WHERE m."created_at" <= u."last_read_at"
);--> statement-breakpoint

-- RESTRUCTURE.md § 2.4. The `0` sentinel is retired here. A file card and a voice
-- player have no box and never had one; the zeros were what forced every reader to
-- test `filename` and `voice` before trusting these as a ratio. `blurhash` goes with
-- them because neither kind uploaded a `_thumb` object for one to describe.
UPDATE "media" SET "width" = NULL, "height" = NULL, "blurhash" = NULL
WHERE "kind" NOT IN ('image', 'video');--> statement-breakpoint

--> TIGHTEN

ALTER TABLE "media" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "scope" SET NOT NULL;--> statement-breakpoint

--> CONSTRAIN
--
-- RESTRUCTURE.md § 2.5. The shape of each kind, held by the database rather than by
-- `registerMedia` alone. That function still validates — it has to tell the user why —
-- but two deployments write this table and neither of them can be the guarantee.

ALTER TABLE "media" ADD CONSTRAINT "media_kind_check" CHECK ("kind" in ('image', 'video', 'audio', 'voice', 'file'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_scope_check" CHECK ("scope" in ('chat', 'avatar', 'background', 'emoticon'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_file_has_name_check" CHECK ("kind" <> 'file' OR "filename" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_name_is_file_check" CHECK ("kind" = 'file' OR "filename" IS NULL);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_voice_has_peaks_check" CHECK ("kind" <> 'voice' OR ("waveform_peaks" IS NOT NULL AND "duration_ms" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_peaks_are_voice_check" CHECK ("kind" = 'voice' OR "waveform_peaks" IS NULL);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_box_is_visual_check" CHECK ("kind" NOT IN ('image','video') OR ("width" IS NOT NULL AND "height" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_no_box_when_not_visual_check" CHECK ("kind" IN ('image','video') OR ("width" IS NULL AND "height" IS NULL AND "blurhash" IS NULL));
