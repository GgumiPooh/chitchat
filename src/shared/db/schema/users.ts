import { pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { media } from "./media";

// INFO: REQUIREMENTS.md § 6. `google_sub` sits on the row itself — one provider means no `accounts` table.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  googleSub: text("google_sub").notNull().unique(),
  // INFO: REQUIREMENTS.md § 8.7. Seeded from the Google account name at first login, user-owned afterwards.
  nickname: text("nickname").notNull(),
  // WARN: `AnyPgColumn` breaks the `users` ⇄ `media` type cycle; drizzle emits the constraint as a separate ALTER either way.
  avatarMediaId: uuid("avatar_media_id").references((): AnyPgColumn => media.id, {
    onDelete: "set null",
  }),
  // WARN: No `defaultNow()` — REQUIREMENTS.md § 8.8. reads unread as `created_at > last_read_at`, so joining at `now()` would mark every message sent before this person's first login as already read.
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
