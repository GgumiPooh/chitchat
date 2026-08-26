import { publishTyping } from "@/entities/user";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NOTIFY_MODE_COOKIE_NAME, toNotifyMode } from "@/shared/config";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 8.12. 입력 중, resent every `TYPING_PING_INTERVAL` for as long
 * as composing continues.
 *
 * INFO: No row is written, so this is a POST that reads nothing back and answers
 * 204. The session lookup already carries the § 12. preference, which is why the
 * check below costs no query of its own.
 */
export async function POST() {
  return publish(true);
}

/**
 * REQUIREMENTS.md § 8.12. Composing ended — the field was emptied, the message
 * was sent, or the typist simply stopped.
 *
 * WARN: This is an optimization on top of the receiver's expiry, never a
 * replacement for it. A sender who is frozen, offline or killed sends no DELETE
 * at all, so the indicator must still come down on silence; what this buys is the
 * common case coming down at once instead of `TYPING_TIMEOUT` later.
 */
export async function DELETE() {
  return publish(false);
}

async function publish(isTyping: boolean) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  // WARN: § 12. Enforced here, on the sending side, and not where the indicator renders. The setting means "do not broadcast that I am typing" — filtered at the receiver the signal has already left this user's device, and the other participant's client is the wrong place to be trusted with it.
  if (!user.typingIndicatorEnabled) {
    return new NextResponse(null, { status: 204 });
  }

  // WARN: REQUIREMENTS.md § 16.1. 나에게만 보내기 — the same doctrine as the switch above, enforced here rather than by the client skipping the request, and read fresh off the cookie for the reason every other § 16.1. route reads it per-request rather than trusting a cached value.
  const notifyMode = toNotifyMode((await cookies()).get(NOTIFY_MODE_COOKIE_NAME)?.value);

  if (notifyMode === "onlyMe") {
    return new NextResponse(null, { status: 204 });
  }

  await publishTyping(user.id, isTyping);

  return new NextResponse(null, { status: 204 });
}
