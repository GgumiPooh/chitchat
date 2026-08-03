import { CONVERSATION_ID } from "@/shared/config";
import { sql } from "drizzle-orm";
import { check, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// INFO: REQUIREMENTS.md § 6. Exactly one row ever exists; `scripts/seed.ts` inserts it under `CONVERSATION_ID`.
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // WARN: Without this the `defaultRandom()` above lets any insert that omits the id open a second conversation, splitting messages across the two with no error.
  // WARN: `sql.raw`, not interpolation — drizzle-kit serializes `${value}` into a bind parameter, and `CHECK ("id" = $1)` is not valid DDL.
  () => [check("conversations_singleton_check", sql.raw(`"id" = '${CONVERSATION_ID}'::uuid`))],
);

export type Conversation = typeof conversations.$inferSelect;
