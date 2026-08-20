import type { MediaId, MessageId, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import { boolean, pgTable, text, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  // INFO: The finished restructure. The read cursor was always a message rather than an instant, and saying so is what lets § 8.8. compare `messages.id > last_read_message_id` — id to id, with no clock and no conversion in SQL.
  // WARN: Nullable, and NULL is "never read, therefore everything is unread". That is the same fact `last_read_at` carried by having no `defaultNow()`: joining a new user at the live edge would mark every message sent before their first login as already read.
  // WARN: No foreign key, deliberately. `messages` already imports this module, so a reference here is the cycle `emoticon_packs.thumbnail_item_id` has to be patched in by a separate ALTER — and it would buy nothing, since `messages` is append-only (§ 6.) and a cursor can only ever name a row that still exists.
  lastReadMessageId: snowflake<MessageId>("last_read_message_id"),
  // INFO: REQUIREMENTS.md § 8.12. Governs whether this user *broadcasts* 입력 중, never whether they are typing right now — that signal is never stored.
  typingIndicatorEnabled: boolean("typing_indicator_enabled").notNull().default(true),
  // INFO: 단축어(Shortcuts) 연동 등 외부 앱 공유 시 백그라운드 인증에 사용되는 영구 키
  shareKey: text("share_key")
    .notNull()
    .unique()
    .default(sql`gen_random_uuid()::text`),
});

export type User = typeof users.$inferSelect;
