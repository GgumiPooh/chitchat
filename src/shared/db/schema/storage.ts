import type { UserId } from "@/shared/lib";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

/**
 * REQUIREMENTS.md § 9. A claim on a storage key, written **before** the object it
 * names — the half of the invariant that makes an orphan impossible rather than
 * merely findable.
 *
 * WARN: The key is the primary key, and there is deliberately no snowflake id. A
 * third table minting ids would put a third copy of the id format in the tree, and
 * `CLAUDE.md § 4.2.1.` names exactly two on the grounds that the drift fails the
 * most quietly of all — jandh-ops reads and writes this table with plain SQL.
 *
 * WARN: `_thumb` is not reserved separately. It is a derived key everywhere else
 * (`media` holds one row for the pair), so a second row here would split a
 * convention that `jandh-ops` already resolves in one place.
 */
export const storageReservations = pgTable(
  "storage_reservations",
  {
    r2Key: text("r2_key").primaryKey(),
    ownerId: snowflake<UserId>("owner_id")
      .notNull()
      .references(() => users.id),
    // WARN: § 9. MUST outlast `UPLOAD_URL_EXPIRY`, or a reclaim runs while the ticket it covers can still be redeemed and the late PUT lands with nothing naming it.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // INFO: § 9. Stamped once the bytes are gone, so a failed delete leaves the row for the next pass instead of needing an attempt counter.
    r2PurgedAt: timestamp("r2_purged_at", { withTimezone: true }),
  },
  (table) => [index("storage_reservations_expires_at_idx").on(table.expiresAt)],
);

export type StorageReservation = typeof storageReservations.$inferSelect;
