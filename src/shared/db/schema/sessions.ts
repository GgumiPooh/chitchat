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
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  // TODO: RESTRUCTURE.md § 3.3. Superseded by the id, which carries its own timestamp, and read by nothing. It stays **declared** only so the schema matches the database until a follow-up change drops it — the drop is a § 6. rule 1 migration and must not run until the build that stopped naming it is live, and `pnpm db:migrate` applies every pending file in one go. Delete this line, `pnpm db:generate`, then migrate.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Session = typeof sessions.$inferSelect;
