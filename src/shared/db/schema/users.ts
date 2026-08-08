import { boolean, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  // INFO: REQUIREMENTS.md § 12.1. The cover behind the profile screen. Public to the other participant, which is what separates it from the column below.
  profileBackgroundMediaId: uuid("profile_background_media_id").references(
    (): AnyPgColumn => media.id,
    { onDelete: "set null" },
  ),
  // TODO: REQUIREMENTS.md § 12.2. Dead — the wallpaper moved to `chat_settings` in `0025` and nothing reads or writes this any more. It stays **declared** only so the schema matches the database until `0026` drops it: the drop is a § 6. rule 1 migration that must not run until this build is live, and `pnpm db:migrate` applies every pending file in one go, so shipping the drop beside `0025` is the one sequence that takes the site down. Delete these four lines, `pnpm db:generate`, then migrate.
  chatBackgroundMediaId: uuid("chat_background_media_id").references((): AnyPgColumn => media.id, {
    onDelete: "set null",
  }),
  // WARN: No `defaultNow()` — REQUIREMENTS.md § 8.8. reads unread as `created_at > last_read_at`, so joining at `now()` would mark every message sent before this person's first login as already read.
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  // INFO: REQUIREMENTS.md § 8.12. Governs whether this user *broadcasts* 입력 중, never whether they are typing right now — that signal is never stored.
  typingIndicatorEnabled: boolean("typing_indicator_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
