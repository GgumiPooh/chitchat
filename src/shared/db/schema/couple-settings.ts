import type { MediaId, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import { boolean, check, date, pgTable, text } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { media } from "./media";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 12.2. One row, and the CHECK is what holds it there — the wallpaper is conversation-wide, so there is no per-user row for it to hang off the way § 12.1.'s cover does.
// WARN: REQUIREMENTS.md § 6. This is not the `conversations` row that section refuses. It carries no id anything else references, no membership, and no FK on `messages` — a second conversation would still need every one of those.
export const coupleSettings = pgTable(
  "couple_settings",
  {
    id: boolean("id").primaryKey().default(true),
    // INFO: REQUIREMENTS.md § 12.2. Owned by whichever participant last set it, so the R2 object stays under that person's `background/` prefix and `canReadMedia` admits it for the other.
    backgroundMediaId: snowflake<MediaId>("background_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    // INFO: REQUIREMENTS.md § 8.15. Conversation-wide, like the wallpaper — either participant may write it, and `runGeneration` reads it as Gemini's `systemInstruction`.
    llmSystemPrompt: text("llm_system_prompt"),
    // INFO: REQUIREMENTS.md § 11.1. Replaces the `RELATIONSHIP_START_DATE` env var — a row, not deployment configuration.
    // WARN: Defaults to the seed value so `writeChatBackground`'s disaster-recovery INSERT (a hand-run DELETE) still type-checks without re-deriving a date it has no way to know.
    startDate: date("start_date").notNull().default("2024-04-26"),
    // INFO: REQUIREMENTS.md § 11.1. The first two accounts ever logged in, in login order — `ALLOWED_EMAILS` stays the allowlist, these only record order.
    firstUserId: snowflake<UserId>("first_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    secondUserId: snowflake<UserId>("second_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [check("couple_settings_singleton_check", sql`${table.id}`)],
);

export type CoupleSettings = typeof coupleSettings.$inferSelect;
