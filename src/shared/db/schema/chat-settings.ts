import type { MediaId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import { boolean, check, pgTable } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { media } from "./media";

// INFO: REQUIREMENTS.md § 12.2. One row, and the CHECK is what holds it there — the wallpaper is conversation-wide, so there is no per-user row for it to hang off the way § 12.1.'s cover does.
// WARN: REQUIREMENTS.md § 6. This is not the `conversations` row that section refuses. It carries no id anything else references, no membership, and no FK on `messages` — a second conversation would still need every one of those.
export const chatSettings = pgTable(
  "chat_settings",
  {
    id: boolean("id").primaryKey().default(true),
    // INFO: REQUIREMENTS.md § 12.2. Owned by whichever participant last set it, so the R2 object stays under that person's `background/` prefix and `canReadMedia` admits it for the other.
    backgroundMediaId: snowflake<MediaId>("background_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
  },
  (table) => [check("chat_settings_singleton_check", sql`${table.id}`)],
);

export type ChatSettings = typeof chatSettings.$inferSelect;
