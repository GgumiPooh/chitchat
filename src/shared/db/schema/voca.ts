import type { MediaId, UserId, VocaCardId, VocaReviewId } from "@/shared/lib";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { media } from "./media";
import { users } from "./users";

export const vocaUserSettings = pgTable("voca_user_settings", {
  userId: snowflake<UserId>("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyNewCards: integer("daily_new_cards").notNull().default(15),
  dailyReviewLimit: integer("daily_review_limit"),
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  lastRemindedDate: text("last_reminded_date"),
  autoplayAudio: boolean("autoplay_audio").notNull().default(true),
  desiredRetention: real("desired_retention").notNull().default(0.9),
  todayExtraNewCards: integer("today_extra_new_cards").notNull().default(0),
});

export const vocaCards = pgTable(
  "voca_cards",
  {
    id: snowflake<VocaCardId>("id").primaryKey(),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("new"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    dueDate: text("due_date"),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    suspended: boolean("suspended").notNull().default(false),
    sentence: text("sentence").notNull(),
    targetWord: text("target_word").notNull(),
    pos: text("pos").notNull(),
    pronunciation: text("pronunciation").notNull(),
    koreanMeaning: text("korean_meaning").notNull(),
    englishDefinition: text("english_definition").notNull(),
    confusable: text("confusable"),
    collocations: text("collocations").notNull(),
    wordFamily: text("word_family"),
    examples: text("examples").notNull(),
    audioUrl: text("audio_url"),
    sentenceAudioUrl: text("sentence_audio_url"),
    audioMediaId: snowflake<MediaId>("audio_media_id").references((): AnyPgColumn => media.id, {
      onDelete: "set null",
    }),
    sentenceAudioMediaId: snowflake<MediaId>("sentence_audio_media_id").references(
      (): AnyPgColumn => media.id,
      { onDelete: "set null" },
    ),
    tags: text("tags"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("voca_cards_user_due_date_idx").on(table.userId, table.dueDate),
    index("voca_cards_user_target_word_idx").on(table.userId, table.targetWord),
  ],
);

export const vocaReviews = pgTable(
  "voca_reviews",
  {
    id: snowflake<VocaReviewId>("id").primaryKey(),
    cardId: snowflake<VocaCardId>("card_id")
      .notNull()
      .references((): AnyPgColumn => vocaCards.id, { onDelete: "cascade" }),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    stateBefore: text("state_before").notNull(),
    stabilityBefore: real("stability_before").notNull(),
    difficultyBefore: real("difficulty_before").notNull(),
    stateAfter: text("state_after").notNull(),
    stabilityAfter: real("stability_after").notNull(),
    difficultyAfter: real("difficulty_after").notNull(),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    timeSpentMs: integer("time_spent_ms").notNull().default(0),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("voca_reviews_user_reviewed_at_idx").on(table.userId, table.reviewedAt),
    index("voca_reviews_card_reviewed_at_idx").on(table.cardId, table.reviewedAt),
  ],
);

export type VocaUserSettingsRow = typeof vocaUserSettings.$inferSelect;
export type NewVocaUserSettingsRow = typeof vocaUserSettings.$inferInsert;
export type VocaCardRow = typeof vocaCards.$inferSelect;
export type NewVocaCardRow = typeof vocaCards.$inferInsert;
export type VocaReviewRow = typeof vocaReviews.$inferSelect;
export type NewVocaReviewRow = typeof vocaReviews.$inferInsert;
