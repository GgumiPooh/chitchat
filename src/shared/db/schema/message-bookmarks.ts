import type { MessageId, UserId } from "@/shared/lib";
import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { messages } from "./messages";
import { users } from "./users";

export const messageBookmarks = pgTable(
  "message_bookmarks",
  {
    messageId: snowflake<MessageId>("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // INFO: REQUIREMENTS.md § 8.19. A reader's own label for the bookmark, set via 편집 → 수정; null shows the message's own summary line instead.
    name: text("name"),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index("message_bookmarks_user_idx").on(table.userId),
  ],
);

export type MessageBookmarkRow = typeof messageBookmarks.$inferSelect;
export type NewMessageBookmarkRow = typeof messageBookmarks.$inferInsert;
