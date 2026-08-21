import "server-only";

import { chatSettings, media } from "@/shared/db";
import type { MediaId, Nullable, UserId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { eq } from "drizzle-orm";

/** The object this change detached, for the caller to take back out of R2. */
export type ReplacedBackground = {
  /**
   * WARN: REQUIREMENTS.md § 12.2. Whoever set the wallpaper being replaced, which is
   * not the person replacing it. The object lives under `background/{ownerId}/` and
   * `discardScopedMedia` narrows to that prefix, so handing it the caller's id
   * silently reclaims nothing every time the two participants take turns.
   */
  ownerId: UserId;
  id: MediaId;
};

export type ChatBackgroundUpdate = {
  backgroundMediaId: Nullable<MediaId>;
  replaced: Nullable<ReplacedBackground>;
};

/**
 * REQUIREMENTS.md § 12.2. Points the one `chat_settings` row at a new wallpaper, or
 * at `null` for the flat `chat-canvas`.
 *
 * WARN: A transaction taking `FOR UPDATE` on the row, **not** § 12.'s
 * `UPDATE … FROM previous` self-join. That pattern does not survive two writers, and
 * this is the app's only row that has two: under READ COMMITTED a blocked UPDATE
 * re-evaluates its qual against the *target* row's new version, while the aliased
 * scan beside it keeps the statement's original snapshot — so both participants
 * saving at once would report the same previous id, and the object the losing write
 * actually detached would be reported by nothing and orphaned in R2. `users` gets
 * away with the self-join because its writers are one person's own devices.
 *
 * INFO: Nothing broadcasts. The write lands on `chat_settings`, whose trigger fires
 * `user_changed` — the same channel § 12. rides — and § 8.4. carries it to the other
 * participant, who reads the new id off the participant payload.
 *
 * INFO: Runs on the caller's own transaction so a freshly uploaded wallpaper
 * registers and attaches in the same commit as this write — the route resolves it
 * with `validateMediaUpload` and `insertMedia` before calling this.
 */
export async function writeChatBackground(
  tx: DbTransaction,
  mediaId: Nullable<MediaId>,
): Promise<ChatBackgroundUpdate> {
  const [current] = await tx
    .select({ backgroundMediaId: chatSettings.backgroundMediaId })
    .from(chatSettings)
    .for("update")
    .limit(1);

  // WARN: REQUIREMENTS.md § 12.2. Self-healing rather than a 404. The row is seeded by `0025` and the CHECK leaves `true` as its only possible key, so the sole way it can be absent is a restore or a hand-run DELETE — and an UPDATE alone would then fail every wallpaper save forever, with a Settings screen showing 기본 배경 and no clue why. The trigger covers the INSERT for the same reason it covers the UPDATE.
  if (!current) {
    await tx.insert(chatSettings).values({ backgroundMediaId: mediaId });

    return { backgroundMediaId: mediaId, replaced: null };
  }

  await tx.update(chatSettings).set({ backgroundMediaId: mediaId });

  return {
    backgroundMediaId: mediaId,
    replaced: await toReplaced(tx, current.backgroundMediaId, mediaId),
  };
}

// INFO: Only an object that is actually gone is handed back. Re-submitting the same id is a no-op, and its object is still the one being drawn.
async function toReplaced(
  tx: DbTransaction,
  before: Nullable<MediaId>,
  after: Nullable<MediaId>,
): Promise<Nullable<ReplacedBackground>> {
  if (!before || before === after) {
    return null;
  }

  // WARN: The owner is read from the object rather than taken from the caller (see `ReplacedBackground`), and `media.owner_id` is the ground truth the R2 prefix is built from. One indexed lookup, and only when a wallpaper was actually replaced.
  const [row] = await tx
    .select({ ownerId: media.ownerId })
    .from(media)
    .where(eq(media.id, before))
    .limit(1);

  return row ? { id: before, ownerId: row.ownerId } : null;
}
