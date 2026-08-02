import { CONVERSATION_ID } from "@/shared/config";
import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 6. Exactly one row ever exists; `scripts/seed.ts` inserts it under `CONVERSATION_ID`.
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // WARN: Without this the `defaultRandom()` above lets any insert that omits the id open a second conversation, splitting messages and members across the two with no error.
  // WARN: `sql.raw`, not interpolation — drizzle-kit serializes `${value}` into a bind parameter, and `CHECK ("id" = $1)` is not valid DDL.
  () => [check("conversations_singleton_check", sql.raw(`"id" = '${CONVERSATION_ID}'::uuid`))],
);

// INFO: REQUIREMENTS.md § 8.8. `last_read_at` is the whole read model — there is no per-message `read_at`.
export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // WARN: No `defaultNow()` — REQUIREMENTS.md § 8.8. reads unread as `created_at > last_read_at`, so joining at `now()` would mark every message sent before this person's first login as already read.
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] })],
);

export type Conversation = typeof conversations.$inferSelect;

export type ConversationMember = typeof conversationMembers.$inferSelect;
