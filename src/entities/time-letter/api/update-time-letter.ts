import "server-only";

import { insertMedia, type ValidatedMedia } from "@/entities/media/@x/time-letter";
import { getDb, letterMedia, media, timeLetters, users } from "@/shared/db";
import type { MediaId, Nullable, TimeLetterId, UserId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { eq, inArray, ne } from "drizzle-orm";
import { toTimeLetter, type TimeLetter, type TimeLetterTheme } from "../model/types";
import { listLettersMedia } from "./list-letters-media";

const MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;
const MAX_SCHEDULE_HORIZON_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export type UpdateTimeLetterParams = {
  letterId: TimeLetterId;
  userId: UserId;
  title?: Nullable<string>;
  content?: string;
  theme?: TimeLetterTheme;
  scheduledAt?: Date | string;
  showTeaser?: boolean;
  onlyMe?: boolean;
  recipientId?: Nullable<UserId>;
  mediaIds?: MediaId[];
  validatedMedia?: ValidatedMedia[];
  tx?: DbTransaction;
};

// INFO: Updates an existing scheduled time letter and manages attached media synchronization.
export async function updateTimeLetter({
  letterId,
  userId,
  title,
  content,
  theme,
  scheduledAt,
  showTeaser,
  onlyMe,
  recipientId,
  mediaIds,
  validatedMedia,
  tx,
}: UpdateTimeLetterParams): Promise<TimeLetter> {
  const runWithDb = async (database: ReturnType<typeof getDb> | DbTransaction) => {
    const [row] = await database
      .select()
      .from(timeLetters)
      .where(eq(timeLetters.id, letterId))
      .limit(1);

    if (!row) {
      throw new Error("Time letter not found");
    }

    // WARN: Only the original sender has authority to update the letter.
    if (row.senderId !== userId) {
      throw new Error("Unauthorized to update this time letter");
    }

    if (row.status !== "scheduled") {
      throw new Error("Cannot update a letter that is already delivered, delivering, or canceled");
    }

    const now = Date.now();
    let scheduledDate: Date | undefined;

    if (scheduledAt !== undefined) {
      scheduledDate = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
      const scheduledTime = scheduledDate.getTime();

      if (Number.isNaN(scheduledTime)) {
        throw new Error("Invalid scheduled date");
      }

      // WARN: If scheduled time changed, lead time of at least 10 minutes is required.
      const isTimeChanged = Math.abs(scheduledTime - row.scheduledAt.getTime()) > 1000;
      if (isTimeChanged) {
        if (
          scheduledTime < now + MIN_SCHEDULE_LEAD_MS ||
          scheduledTime > now + MAX_SCHEDULE_HORIZON_MS
        ) {
          throw new Error(
            "Scheduled time must be at least 10 minutes in the future and at most 5 years away",
          );
        }
      } else if (scheduledTime <= now) {
        throw new Error("Scheduled time has already passed");
      }
    } else if (row.scheduledAt.getTime() <= now) {
      throw new Error("Scheduled time has already passed");
    }

    let targetRecipientId = row.recipientId;
    const effectiveOnlyMe = onlyMe !== undefined ? onlyMe : row.onlyMe;

    if (effectiveOnlyMe) {
      targetRecipientId = null;
    } else if (recipientId !== undefined) {
      targetRecipientId = recipientId;
    }

    if (!effectiveOnlyMe && !targetRecipientId) {
      const [partner] = await database
        .select({ id: users.id })
        .from(users)
        .where(ne(users.id, userId))
        .limit(1);
      targetRecipientId = partner?.id ?? null;
    }

    const updateValues: Partial<typeof timeLetters.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) {
      updateValues.title = title?.trim() || null;
    }
    if (content !== undefined) {
      if (content.trim().length === 0) {
        throw new Error("Letter content cannot be empty");
      }
      updateValues.content = content.trim();
    }
    if (theme !== undefined) {
      updateValues.theme = theme;
    }
    if (scheduledDate !== undefined) {
      updateValues.scheduledAt = scheduledDate;
    }
    if (showTeaser !== undefined) {
      updateValues.showTeaser = effectiveOnlyMe ? false : showTeaser;
    }
    if (onlyMe !== undefined) {
      updateValues.onlyMe = onlyMe;
      if (onlyMe) {
        updateValues.showTeaser = false;
      }
    }
    updateValues.recipientId = targetRecipientId;

    const [updatedRow] = await database
      .update(timeLetters)
      .set(updateValues)
      .where(eq(timeLetters.id, letterId))
      .returning();

    // INFO: Synchronize attached media rows if media changes were submitted.
    if (mediaIds !== undefined || (validatedMedia && validatedMedia.length > 0)) {
      const resolvedMediaIds: MediaId[] = [...(mediaIds ?? [])];

      if (validatedMedia && validatedMedia.length > 0) {
        for (const item of validatedMedia) {
          const mRow = await insertMedia(database as DbTransaction, item);
          if (!mRow) {
            throw new Error("Failed to insert media");
          }
          resolvedMediaIds.push(mRow.id);
        }
      }

      const existingAttached = await database
        .select({ mediaId: letterMedia.mediaId })
        .from(letterMedia)
        .where(eq(letterMedia.letterId, letterId));

      const existingMediaIds = existingAttached.map((m) => m.mediaId);
      const keptSet = new Set(resolvedMediaIds);
      const removedMediaIds = existingMediaIds.filter((id) => !keptSet.has(id));

      if (removedMediaIds.length > 0) {
        await database
          .update(media)
          .set({ deletedAt: new Date() })
          .where(inArray(media.id, removedMediaIds));
      }

      await database.delete(letterMedia).where(eq(letterMedia.letterId, letterId));

      if (resolvedMediaIds.length > 0) {
        await database.insert(letterMedia).values(
          resolvedMediaIds.map((mediaId, sortOrder) => ({
            letterId,
            mediaId,
            sortOrder,
          })),
        );
      }
    }

    const [sender] = await database
      .select({ nickname: users.nickname })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const mediaMap = await listLettersMedia([letterId], database as DbTransaction);
    return toTimeLetter(updatedRow, mediaMap.get(letterId) ?? [], false, sender?.nickname);
  };

  if (tx) {
    return runWithDb(tx);
  }

  return getDb().transaction(async (innerTx) => {
    return runWithDb(innerTx);
  });
}
