import "server-only";

import { insertMedia, type ValidatedMedia } from "@/entities/media/@x/time-letter";
import { getDb, letterMedia, nextSnowflake, timeLetters, users } from "@/shared/db";
import type { MediaId, Nullable, TimeLetterId, UserId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { and, count, eq, ne } from "drizzle-orm";
import { toTimeLetter, type TimeLetter, type TimeLetterTheme } from "../model/types";
import { listLettersMedia } from "./list-letters-media";

const MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;
const MAX_SCHEDULE_HORIZON_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_SCHEDULED_LETTERS = 30;

export type CreateTimeLetterParams = {
  senderId: UserId;
  recipientId?: Nullable<UserId>;
  title?: Nullable<string>;
  content: string;
  theme?: TimeLetterTheme;
  scheduledAt: Date | string;
  showTeaser?: boolean;
  onlyMe?: boolean;
  mediaIds?: MediaId[];
  validatedMedia?: ValidatedMedia[];
  tx?: DbTransaction;
};

// INFO: Creates a new time machine letter after validating the scheduled time and user quota.
export async function createTimeLetter({
  senderId,
  recipientId,
  title,
  content,
  theme = "classic",
  scheduledAt,
  showTeaser = false,
  onlyMe = false,
  mediaIds = [],
  validatedMedia = [],
  tx,
}: CreateTimeLetterParams): Promise<TimeLetter> {
  const scheduledDate = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  const scheduledTime = scheduledDate.getTime();
  const now = Date.now();

  // WARN: Time letters require at least 10 minutes preparation lead time and capped at 5 years horizon.
  if (
    Number.isNaN(scheduledTime) ||
    scheduledTime < now + MIN_SCHEDULE_LEAD_MS ||
    scheduledTime > now + MAX_SCHEDULE_HORIZON_MS
  ) {
    throw new Error(
      "Scheduled time must be at least 10 minutes in the future and at most 5 years away",
    );
  }

  const runWithDb = async (database: ReturnType<typeof getDb> | DbTransaction) => {
    // WARN: Prevent spam or storage exhaustion by capping active scheduled letters per sender.
    const [activeRow] = await database
      .select({ count: count() })
      .from(timeLetters)
      .where(and(eq(timeLetters.senderId, senderId), eq(timeLetters.status, "scheduled")));

    if ((activeRow?.count ?? 0) >= MAX_ACTIVE_SCHEDULED_LETTERS) {
      throw new Error("Active scheduled letters limit reached (maximum 30)");
    }

    let targetRecipientId: Nullable<UserId> = onlyMe ? null : (recipientId ?? null);
    if (!onlyMe && !targetRecipientId) {
      const [partner] = await database
        .select({ id: users.id })
        .from(users)
        .where(ne(users.id, senderId))
        .limit(1);
      targetRecipientId = partner?.id ?? null;
    }

    const letterId = nextSnowflake<TimeLetterId>();

    const [row] = await database
      .insert(timeLetters)
      .values({
        id: letterId,
        senderId,
        recipientId: targetRecipientId,
        title: title?.trim() || null,
        content: content.trim(),
        theme,
        status: "scheduled",
        scheduledAt: scheduledDate,
        showTeaser: onlyMe ? false : showTeaser,
        onlyMe,
      })
      .returning();

    const resolvedMediaIds: MediaId[] = [...mediaIds];

    if (validatedMedia.length > 0) {
      for (const item of validatedMedia) {
        const row = await insertMedia(database as DbTransaction, item);
        if (!row) {
          throw new Error("Failed to insert media");
        }
        resolvedMediaIds.push(row.id);
      }
    }

    if (resolvedMediaIds.length > 0) {
      await database.insert(letterMedia).values(
        resolvedMediaIds.map((mediaId, sortOrder) => ({
          letterId,
          mediaId,
          sortOrder,
        })),
      );
    }

    const [sender] = await database
      .select({ nickname: users.nickname })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    const mediaMap = await listLettersMedia([letterId], database as DbTransaction);
    return toTimeLetter(row, mediaMap.get(letterId) ?? [], false, sender?.nickname);
  };

  if (tx) {
    return runWithDb(tx);
  }

  return getDb().transaction(async (innerTx) => {
    return runWithDb(innerTx);
  });
}
