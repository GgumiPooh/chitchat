ALTER TABLE "voca_cards" ADD COLUMN "learning_steps" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "voca_cards" ADD COLUMN "last_reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "voca_reviews" ADD COLUMN "learning_steps_before" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "voca_cards" AS c
SET "last_reviewed_at" = r."last_reviewed_at"
FROM (
  SELECT "card_id", max("reviewed_at") AS "last_reviewed_at"
  FROM "voca_reviews"
  GROUP BY "card_id"
) AS r
WHERE c."id" = r."card_id";
--> statement-breakpoint
-- Cards left in (re)learning never knew their step and looped on it (REQUIREMENTS.md § 17.1.); graduate them at the interval their stability already earns, due at the 04:00 KST rollover.
WITH graduated AS (
  SELECT
    "id",
    to_char(
      ((coalesce("last_reviewed_at", now()) + make_interval(days => greatest(1, round("stability"))::int)) AT TIME ZONE 'Asia/Seoul') - interval '4 hours',
      'YYYY-MM-DD'
    ) AS "due_date"
  FROM "voca_cards"
  WHERE "state" IN ('learning', 'relearning')
)
UPDATE "voca_cards" AS c
SET
  "state" = 'review',
  "learning_steps" = 0,
  "due_date" = g."due_date",
  "due_at" = (g."due_date"::date + time '04:00') AT TIME ZONE 'Asia/Seoul'
FROM graduated AS g
WHERE c."id" = g."id";
