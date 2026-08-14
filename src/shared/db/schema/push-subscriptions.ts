import type { PushSubscriptionId, UserId } from "@/shared/lib";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 16.1. One row per browser installation, not per user — the same person carries a phone and a laptop.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: snowflake<PushSubscriptionId>("id").primaryKey(),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // WARN: Unique across the whole table, not per user. The push service owns this string and hands the same one back to whoever logs in on that installation, so a second account on one browser MOVES the row rather than adding a second.
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    // INFO: REQUIREMENTS.md § 16.1. 알림 소리 is a property of the installation, so it belongs on this row rather than on `users` — one person silences the laptop and keeps the phone audible.
    soundEnabled: boolean("sound_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // INFO: Null until the first successful send — a subscription that never delivers is what a stale-device cleanup would look for.
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)],
);

// WARN: Not `PushSubscription` — that name is a DOM global, and shadowing it in a client module silently retypes the browser object the subscribe call returns.
export type StoredPushSubscription = typeof pushSubscriptions.$inferSelect;
