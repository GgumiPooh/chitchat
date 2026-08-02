import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// INFO: REQUIREMENTS.md § 6. `google_sub` sits on the row itself — one provider means no `accounts` table.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  googleSub: text("google_sub").notNull().unique(),
  // INFO: REQUIREMENTS.md § 8.7. Seeded from the Google account name at first login, user-owned afterwards.
  nickname: text("nickname").notNull(),
  // TODO: Reference `media.id` once the media table lands (REQUIREMENTS.md § 6.).
  avatarMediaId: uuid("avatar_media_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
