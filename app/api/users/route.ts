import { readChatBackground } from "@/entities/chat-background";
import { readLlmSystemPrompt } from "@/entities/llm-system-prompt";
import { listUsers } from "@/entities/user";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 8.4. The whole participant set, deliberately without a cursor
 * — a rename produces no new row, so an id cursor would never fire and an
 * `updated_at` one would still miss a deletion. Two rows are cheaper to refetch
 * whole. Serves first render, a `user` SSE event, and the resume catch-up alike.
 *
 * WARN: REQUIREMENTS.md § 12.2. The shared wallpaper rides along, which is why this
 * answers more than its path says. It is not a property of any user, but it is
 * invalidated by exactly the same event — the `couple_settings` trigger fires
 * `user_changed` — and the client answers that by refetching this payload whole. A
 * route of its own would double the requests on a channel that also carries every
 * § 8.8. read-cursor bump, to deliver a single id.
 *
 * INFO: REQUIREMENTS.md § 8.15. The shared 쨈미니 system prompt rides along for the
 * same reason — another `couple_settings` field, invalidated by the same trigger.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const [users, chatBackground, llmSystemPrompt] = await Promise.all([
    listUsers(),
    readChatBackground(),
    readLlmSystemPrompt(),
  ]);

  // INFO: REQUIREMENTS.md § 12.2. The hash rides with the id rather than being fetched per wallpaper — it is what the chat route's chrome is tinted with, and both move on exactly the same event.
  return NextResponse.json({
    users,
    chatBackgroundMediaId: chatBackground?.mediaId ?? null,
    chatBackgroundBlurhash: chatBackground?.blurhash ?? null,
    llmSystemPrompt,
  });
}
