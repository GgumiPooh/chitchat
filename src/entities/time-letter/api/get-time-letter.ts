import "server-only";

import { getDb, timeLetters, users } from "@/shared/db";
import type { Nullable, TimeLetterId, UserId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { toTimeLetter, type TimeLetter } from "../model/types";
import { listLettersMedia } from "./list-letters-media";

export type GetTimeLetterParams = {
  letterId: TimeLetterId;
  currentUserId: UserId;
};

// INFO: Fetches a single time letter, enforcing sender full access and recipient teaser/delivered restrictions.
export async function getTimeLetter({
  letterId,
  currentUserId,
}: GetTimeLetterParams): Promise<Nullable<TimeLetter>> {
  const db = getDb();
  const [row] = await db.select().from(timeLetters).where(eq(timeLetters.id, letterId)).limit(1);

  if (!row) {
    return null;
  }

  const [sender] = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(eq(users.id, row.senderId))
    .limit(1);

  // INFO: Sender has unrestricted access to view their own letter.
  if (row.senderId === currentUserId) {
    const mediaMap = await listLettersMedia([letterId]);
    return toTimeLetter(row, mediaMap.get(letterId) ?? [], false, sender?.nickname);
  }

  // WARN: Recipient only has access if onlyMe is false and letter is not canceled.
  if (row.recipientId === currentUserId && !row.onlyMe) {
    if (row.status === "sent") {
      const mediaMap = await listLettersMedia([letterId]);
      return toTimeLetter(row, mediaMap.get(letterId) ?? [], false, sender?.nickname);
    }

    if (row.status === "scheduled" && row.showTeaser) {
      return toTimeLetter(row, [], true, sender?.nickname);
    }
  }

  return null;
}
