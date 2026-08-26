import "server-only";

import { getDb, messageReactions } from "@/shared/db";
import type { EmoticonItemId, MessageId, UserId } from "@/shared/lib";
import { and, eq } from "drizzle-orm";

export type ToggleReactionInput = {
  reactionType: "emoji" | "emoticon";
  emoji?: string;
  emoticonItemId?: EmoticonItemId;
};

export type ToggleReactionResult =
  | { action: "removed" }
  | {
      action: "set";
      reaction: {
        messageId: MessageId;
        userId: UserId;
        reactionType: "emoji" | "emoticon";
        emoji: string | null;
        emoticonItemId: EmoticonItemId | null;
      };
    };

export async function toggleReaction(
  messageId: MessageId,
  userId: UserId,
  input: ToggleReactionInput,
): Promise<ToggleReactionResult> {
  const db = getDb();

  const condition =
    input.reactionType === "emoji"
      ? and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.reactionType, "emoji"),
          eq(messageReactions.emoji, input.emoji ?? ""),
        )
      : and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.reactionType, "emoticon"),
          eq(messageReactions.emoticonItemId, input.emoticonItemId!),
        );

  const [existing] = await db.select().from(messageReactions).where(condition).limit(1);

  if (existing) {
    await db.delete(messageReactions).where(condition);
    return { action: "removed" };
  }

  const newRow = {
    messageId,
    userId,
    reactionType: input.reactionType,
    emoji: input.reactionType === "emoji" ? (input.emoji ?? null) : null,
    emoticonItemId: input.reactionType === "emoticon" ? (input.emoticonItemId ?? null) : null,
  };

  await db.insert(messageReactions).values(newRow);

  return {
    action: "set",
    reaction: {
      messageId,
      userId,
      reactionType: newRow.reactionType,
      emoji: newRow.emoji,
      emoticonItemId: newRow.emoticonItemId,
    },
  };
}
