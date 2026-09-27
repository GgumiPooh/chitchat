import "server-only";

import { countUnreadMessages, createTimeLetterMessage } from "@/entities/message";
import { pushToUser } from "@/entities/push-subscription";
import { apiError } from "@/shared/api";
import { TIME_LETTERS_ROUTE } from "@/shared/config";
import { getDb, letterMedia, messageMedia, timeLetters, users } from "@/shared/db";
import type { Nullable, TimeLetterId, UserId } from "@/shared/lib";
import { isOpsCronConfigured, isOpsCronRequest } from "@/shared/ops";
import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PendingDispatch = {
  letterId: TimeLetterId;
  senderId: UserId;
  recipientId: Nullable<UserId>;
  title: Nullable<string>;
  onlyMe: boolean;
};

// INFO: Ops cron route to dispatch due time letters into chat timeline and send push notifications.
export async function POST(request: Request) {
  if (!isOpsCronConfigured()) {
    return apiError("unavailable");
  }

  if (!isOpsCronRequest(request)) {
    return apiError("unauthorized");
  }

  const db = getDb();
  const dispatchedLetters: PendingDispatch[] = [];

  // WARN: Use FOR UPDATE SKIP LOCKED inside transaction to safely avoid duplicate dispatches across concurrent cron runs.
  await db.transaction(async (tx) => {
    const claimedResult = await tx.execute<{ id: string }>(
      sql`SELECT id FROM time_letters WHERE status = 'scheduled' AND scheduled_at <= NOW() LIMIT 10 FOR UPDATE SKIP LOCKED`,
    );

    const claimedIds = Array.from(claimedResult).map(
      (row) => (row as { id: string }).id as TimeLetterId,
    );
    if (claimedIds.length === 0) {
      return;
    }

    for (const letterId of claimedIds) {
      const [letter] = await tx.select().from(timeLetters).where(eq(timeLetters.id, letterId));

      if (!letter || letter.status !== "scheduled") {
        continue;
      }

      await tx
        .update(timeLetters)
        .set({ status: "delivering", updatedAt: new Date() })
        .where(eq(timeLetters.id, letterId));

      const message = await createTimeLetterMessage({
        senderId: letter.senderId,
        letterId: letter.id,
        title: letter.title,
        tx,
      });

      // INFO: Connect letter media into message_media so attachments appear in the chat room and archive gallery.
      const mediaRows = await tx
        .select({
          mediaId: letterMedia.mediaId,
          sortOrder: letterMedia.sortOrder,
        })
        .from(letterMedia)
        .where(eq(letterMedia.letterId, letter.id))
        .orderBy(asc(letterMedia.sortOrder));

      if (mediaRows.length > 0) {
        await tx.insert(messageMedia).values(
          mediaRows.map((m) => ({
            messageId: message.id,
            mediaId: m.mediaId,
            sortOrder: m.sortOrder,
          })),
        );
      }

      await tx
        .update(timeLetters)
        .set({
          status: "sent",
          sentAt: new Date(),
          deliveredMessageId: message.id,
          updatedAt: new Date(),
        })
        .where(eq(timeLetters.id, letterId));

      dispatchedLetters.push({
        letterId: letter.id,
        senderId: letter.senderId,
        recipientId: letter.recipientId,
        title: letter.title,
        onlyMe: letter.onlyMe,
      });
    }
  });

  // INFO: Push notifications are dispatched outside the transaction so notification delays or failures do not roll back delivery.
  if (dispatchedLetters.length > 0) {
    try {
      const userRows = await db.select({ id: users.id, nickname: users.nickname }).from(users);
      const userMap = new Map(userRows.map((u) => [u.id, u.nickname]));

      for (const letter of dispatchedLetters) {
        if (letter.recipientId && !letter.onlyMe) {
          const senderName = userMap.get(letter.senderId) ?? "파트너";
          const titleSnippet = letter.title ? ` · ${letter.title}` : "";
          const body = `${senderName}님이 보낸 타임머신 편지가 도착했어요!${titleSnippet}`;
          const unreadCount = await countUnreadMessages(letter.recipientId);

          await pushToUser(letter.recipientId, {
            title: "💌 타임머신 편지 도착",
            body,
            unreadCount,
            url: `${TIME_LETTERS_ROUTE}?id=${letter.letterId}`,
            tag: `time-letter-${letter.letterId}`,
          });
        }
      }
    } catch (error) {
      console.error("[dispatch-letters] Failed to send push notifications:", error);
    }
  }

  return NextResponse.json({ dispatched: dispatchedLetters.length });
}
