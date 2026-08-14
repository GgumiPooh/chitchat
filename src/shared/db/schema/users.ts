import type { MediaId, MessageId, UserId } from "@/shared/lib";
import { boolean, pgTable, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { media } from "./media";

// INFO: REQUIREMENTS.md § 6. `google_sub` sits on the row itself — one provider means no `accounts` table.
export const users = pgTable("users", {
  id: snowflake<UserId>("id").primaryKey(),
  email: text("email").notNull().unique(),
  googleSub: text("google_sub").notNull().unique(),
  // INFO: REQUIREMENTS.md § 8.7. Seeded from the Google account name at first login, user-owned afterwards.
  nickname: text("nickname").notNull(),
  // WARN: `AnyPgColumn` breaks the `users` ⇄ `media` type cycle; drizzle emits the constraint as a separate ALTER either way.
  avatarMediaId: snowflake<MediaId>("avatar_media_id").references((): AnyPgColumn => media.id, {
    onDelete: "set null",
  }),
  // INFO: REQUIREMENTS.md § 12.1. The cover behind the profile screen. Public to the other participant, which is what separates it from the column below.
  profileBackgroundMediaId: snowflake<MediaId>("profile_background_media_id").references(
    (): AnyPgColumn => media.id,
    { onDelete: "set null" },
  ),
  // TODO: RESTRUCTURE.md § 3.5. Replaced by `last_read_message_id` below, and dropped in the change after this one. Nothing reads it and only `upsert-google-user` still writes it.
  // WARN: § 6. rule 3. The `NOT NULL` is relaxed **first, in its own migration**, and that is not ceremony: a build that stops naming this column still inserts a user through § 5.4.'s dev login, which is exactly how the third `users` row got here — so the window between deploying that build and running the drop would answer `23502` rather than being unreachable. Relaxed, the column tolerates both builds and the drop needs no window at all.
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  // INFO: RESTRUCTURE.md § 3.5. The read cursor was always a message rather than an instant, and saying so is what lets § 8.8. compare `messages.id > last_read_message_id` — id to id, with no clock and no conversion in SQL.
  // WARN: Nullable, and NULL is "never read, therefore everything is unread". That is the same fact `last_read_at` carried by having no `defaultNow()`: joining a new user at the live edge would mark every message sent before their first login as already read.
  // WARN: No foreign key, deliberately. `messages` already imports this module, so a reference here is the cycle `emoticon_packs.thumbnail_item_id` has to be patched in by a separate ALTER — and it would buy nothing, since `messages` is append-only (§ 6.) and a cursor can only ever name a row that still exists.
  lastReadMessageId: snowflake<MessageId>("last_read_message_id"),
  // INFO: REQUIREMENTS.md § 8.12. Governs whether this user *broadcasts* 입력 중, never whether they are typing right now — that signal is never stored.
  typingIndicatorEnabled: boolean("typing_indicator_enabled").notNull().default(true),
});

export type User = typeof users.$inferSelect;
