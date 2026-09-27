import "server-only";

import { getDb, timeLetters, users } from "@/shared/db";
import type { Nullable, TimeLetterId, UserId } from "@/shared/lib";
import { and, asc, desc, eq, gt, lt, ne, or, type SQL } from "drizzle-orm";
import { toTimeLetter, type TimeLetter, type TimeLetterStatus } from "../model/types";
import { listLettersMedia } from "./list-letters-media";

export type ListTimeLettersOptions = {
  currentUserId: UserId;
  status?: TimeLetterStatus;
  cursor?: string;
  limit?: number;
};

export type ListTimeLettersResult = {
  items: TimeLetter[];
  nextCursor: Nullable<string>;
  hasMore: boolean;
};

function parseCursor(raw?: string): { instant: Date; id: TimeLetterId } | null {
  if (!raw) {
    return null;
  }
  const splitIndex = raw.lastIndexOf("_");
  if (splitIndex === -1) {
    return null;
  }
  const timePart = raw.slice(0, splitIndex);
  const idPart = raw.slice(splitIndex + 1) as TimeLetterId;
  const instant = new Date(timePart);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return { instant, id: idPart };
}

// INFO: Lists time letters visible to current user with keyset pagination and strict privacy masking.
export async function listTimeLetters({
  currentUserId,
  status,
  cursor,
  limit = 20,
}: ListTimeLettersOptions): Promise<ListTimeLettersResult> {
  const db = getDb();

  // WARN: Privacy rule: Sender sees all their letters. Recipient only sees non-canceled letters with onlyMe=false,
  // and scheduled letters only if showTeaser is true.
  const visibilityCondition = or(
    eq(timeLetters.senderId, currentUserId),
    and(
      eq(timeLetters.recipientId, currentUserId),
      eq(timeLetters.onlyMe, false),
      ne(timeLetters.status, "canceled"),
      or(ne(timeLetters.status, "scheduled"), eq(timeLetters.showTeaser, true)),
    ),
  );

  const filters: SQL[] = [visibilityCondition!];

  if (status) {
    filters.push(eq(timeLetters.status, status));
  }

  const parsedCursor = parseCursor(cursor);

  // INFO: Scheduled letters are presented in upcoming arrival order (ASC); sent letters in newest-first order (DESC).
  const isScheduledAsc = status === "scheduled";
  const orderColumns = isScheduledAsc
    ? [asc(timeLetters.scheduledAt), asc(timeLetters.id)]
    : status === "sent"
      ? [desc(timeLetters.sentAt), desc(timeLetters.id)]
      : [desc(timeLetters.scheduledAt), desc(timeLetters.id)];

  if (parsedCursor) {
    if (isScheduledAsc) {
      filters.push(
        or(
          gt(timeLetters.scheduledAt, parsedCursor.instant),
          and(
            eq(timeLetters.scheduledAt, parsedCursor.instant),
            gt(timeLetters.id, parsedCursor.id),
          ),
        )!,
      );
    } else if (status === "sent") {
      filters.push(
        or(
          lt(timeLetters.sentAt, parsedCursor.instant),
          and(eq(timeLetters.sentAt, parsedCursor.instant), lt(timeLetters.id, parsedCursor.id)),
        )!,
      );
    } else {
      filters.push(
        or(
          lt(timeLetters.scheduledAt, parsedCursor.instant),
          and(
            eq(timeLetters.scheduledAt, parsedCursor.instant),
            lt(timeLetters.id, parsedCursor.id),
          ),
        )!,
      );
    }
  }

  const rows = await db
    .select()
    .from(timeLetters)
    .where(and(...filters))
    .orderBy(...orderColumns)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slicedRows = hasMore ? rows.slice(0, limit) : rows;

  // INFO: Only fetch media attachments for letters where content is unmasked.
  const readableLetterIds = slicedRows
    .filter((row) => !(row.status === "scheduled" && row.senderId !== currentUserId))
    .map((row) => row.id);

  const [mediaMap, userRows] = await Promise.all([
    listLettersMedia(readableLetterIds),
    db.select({ id: users.id, nickname: users.nickname }).from(users),
  ]);

  const userMap = new Map(userRows.map((u) => [u.id, u.nickname]));

  const items = slicedRows.map((row) => {
    const isTeaserMasked = row.status === "scheduled" && row.senderId !== currentUserId;
    const mediaList = isTeaserMasked ? [] : (mediaMap.get(row.id) ?? []);
    return toTimeLetter(row, mediaList, isTeaserMasked, userMap.get(row.senderId));
  });

  let nextCursor: Nullable<string> = null;
  if (hasMore && slicedRows.length > 0) {
    const lastRow = slicedRows[slicedRows.length - 1];
    if (isScheduledAsc) {
      nextCursor = `${lastRow.scheduledAt.toISOString()}_${lastRow.id}`;
    } else if (status === "sent") {
      nextCursor = `${lastRow.sentAt?.toISOString() ?? lastRow.scheduledAt.toISOString()}_${lastRow.id}`;
    } else {
      nextCursor = `${lastRow.scheduledAt.toISOString()}_${lastRow.id}`;
    }
  }

  return {
    items,
    nextCursor,
    hasMore,
  };
}
