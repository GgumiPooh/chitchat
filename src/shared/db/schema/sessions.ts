import type { SessionId, UserId } from "@/shared/lib";
import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
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
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  encryptionKey: text("encryption_key"),
});

export type Session = typeof sessions.$inferSelect;

// SEC: Multi-instance anti-replay store (created as UNLOGGED in 0079_request_nonces_unlogged.sql for memory-speed atomic inserts without WAL fsync overhead).
export const requestNonces = pgTable(
  "request_nonces",
  {
    sessionId: snowflake<SessionId>("session_id").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.nonce] }),
    index("request_nonces_expires_at_idx").on(table.expiresAt),
  ],
);

export type RequestNonce = typeof requestNonces.$inferSelect;
