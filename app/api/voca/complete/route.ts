import "server-only";

import { createVocaCompletionMessage } from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { safelyRunAsync } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const completeSchema = z.object({
  count: z.number().int().positive(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = completeSchema.safeParse(json);

  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { count } = parsed.data;

  const notice = await createVocaCompletionMessage({
    senderId: user.id,
    count,
  });

  after(() =>
    safelyRunAsync(() => notifyMessageRecipients(user, `영단어 ${count}개 학습을 마쳤어요! 👏`)),
  );

  return NextResponse.json({ message: notice }, { status: 201 });
}
