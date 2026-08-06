import { publishTyping } from "@/entities/user";
import { getCurrentUser } from "@/shared/auth";
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // WARN: § 12. Enforced here, on the sending side, and not where the indicator renders. The setting means "do not broadcast that I am typing" — filtered at the receiver the signal has already left this user's device, and the other participant's client is the wrong place to be trusted with it.
  if (!user.typingIndicatorEnabled) {
    return new NextResponse(null, { status: 204 });
  }

  await publishTyping(user.id, isTyping);

  return new NextResponse(null, { status: 204 });
}
