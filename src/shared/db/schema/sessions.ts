import type { SessionId, UserId } from "@/shared/lib";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 5.2. `token_hash` is unique, which is also the lookup index the session check needs.
export const sessions = pgTable("sessions", {
  id: snowflake<SessionId>("id").primaryKey(),
  userId: snowflake<UserId>("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  deviceLabel: text("device_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Session = typeof sessions.$inferSelect;
