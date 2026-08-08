import { readChatBackgroundMediaId } from "@/entities/chat-background";
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
 * invalidated by exactly the same event — the `chat_settings` trigger fires
 * `user_changed` — and the client answers that by refetching this payload whole. A
 * route of its own would double the requests on a channel that also carries every
 * § 8.8. read-cursor bump, to deliver a single id.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const [users, chatBackgroundMediaId] = await Promise.all([
    listUsers(),
    readChatBackgroundMediaId(),
  ]);

  return NextResponse.json({ users, chatBackgroundMediaId });
}
