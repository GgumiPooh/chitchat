import type { EmoticonItemId, MessageId, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { emoticonItems } from "./emoticons";
import { messages } from "./messages";
import { users } from "./users";

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: snowflake<MessageId>("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reactionType: text("reaction_type").notNull(),
    emoji: text("emoji"),
    emoticonItemId: snowflake<EmoticonItemId>("emoticon_item_id").references(
      () => emoticonItems.id,
      { onDelete: "cascade" },
    ),
  },
  (table) => [
    index("message_reactions_message_idx").on(table.messageId),
    uniqueIndex("message_reactions_emoji_uniq")
      .on(table.messageId, table.userId, table.emoji)
      .where(sql`${table.reactionType} = 'emoji'`),
    uniqueIndex("message_reactions_emoticon_uniq")
      .on(table.messageId, table.userId, table.emoticonItemId)
      .where(sql`${table.reactionType} = 'emoticon'`),
  ],
);

export type MessageReactionRow = typeof messageReactions.$inferSelect;
export type NewMessageReactionRow = typeof messageReactions.$inferInsert;
