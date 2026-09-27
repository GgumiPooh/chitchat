import type { MediaId, MessageId, TimeLetterId, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { media } from "./media";
import { messages } from "./messages";
import { users } from "./users";

export const letterStatusEnum = pgEnum("letter_status", [
  "scheduled",
  "delivering",
  "sent",
  "canceled",
]);

export const timeLetters = pgTable(
  "time_letters",
  {
    id: snowflake<TimeLetterId>("id").primaryKey(),
    senderId: snowflake<UserId>("sender_id")
      .notNull()
      .references(() => users.id),
    recipientId: snowflake<UserId>("recipient_id").references(() => users.id),
    title: text("title"),
    content: text("content").notNull(),
    theme: text("theme").notNull().default("classic"),
    status: letterStatusEnum("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    showTeaser: boolean("show_teaser").notNull().default(false),
    onlyMe: boolean("only_me").notNull().default(false),
    deliveredMessageId: snowflake<MessageId>("delivered_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    retryCount: smallint("retry_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("time_letters_dispatch_idx")
      .on(table.scheduledAt)
      .where(sql`"status" = 'scheduled'`),
    index("time_letters_sent_idx")
      .on(table.sentAt)
      .where(sql`"status" = 'sent'`),
    index("time_letters_sender_idx").on(table.senderId, table.status),
  ],
);

export const letterMedia = pgTable(
  "letter_media",
  {
    letterId: snowflake<TimeLetterId>("letter_id")
      .notNull()
      .references(() => timeLetters.id, { onDelete: "cascade" }),
    mediaId: snowflake<MediaId>("media_id")
      .notNull()
      .references(() => media.id),
    sortOrder: smallint("sort_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.letterId, table.sortOrder] }),
    index("letter_media_media_id_idx").on(table.mediaId),
  ],
);

export type TimeLetter = typeof timeLetters.$inferSelect;
export type LetterMedia = typeof letterMedia.$inferSelect;
export type LetterStatus = (typeof letterStatusEnum.enumValues)[number];
