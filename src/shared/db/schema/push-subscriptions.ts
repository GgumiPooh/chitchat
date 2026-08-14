import type { PushSubscriptionId, SessionId, UserId } from "@/shared/lib";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { sessions } from "./sessions";
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
    // INFO: REQUIREMENTS.md § 12. The cascade IS the revocation — § 12.'s 로그아웃, the shell's own logout and the § 5.2. expiry sweep all delete a `sessions` row, and none of them knows an endpoint to name.
    // WARN: Nullable because a row written before this column existed has no session to point at, and because the § 5.2. sweep deletes an expired session out from under a live installation. Both heal on the next launch upsert.
    sessionId: snowflake<SessionId>("session_id").references(() => sessions.id, {
      onDelete: "cascade",
    }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    // INFO: REQUIREMENTS.md § 16.1. 알림 소리 is a property of the installation, so it belongs on this row rather than on `users` — one person silences the laptop and keeps the phone audible.
    soundEnabled: boolean("sound_enabled").notNull().default(true),
    // INFO: Diagnostics only. It is NOT what retires an abandoned device — `REQUIREMENTS.md § 16.1.` explains why a send to one still succeeds.
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 16.1. The launch upsert stamps this, so it dates the last time the app was OPENED on this installation — which is the only thing that distinguishes an abandoned device from a quiet one.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    // TODO: RESTRUCTURE.md § 3.3. Superseded by the id, which carries its own timestamp, and read by nothing. It stays **declared** only so the schema matches the database until a follow-up change drops it — the drop is a § 6. rule 1 migration and must not run until the build that stopped naming it is live. Delete this line, `pnpm db:generate`, then migrate.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)],
);

// WARN: Not `PushSubscription` — that name is a DOM global, and shadowing it in a client module silently retypes the browser object the subscribe call returns.
export type StoredPushSubscription = typeof pushSubscriptions.$inferSelect;
