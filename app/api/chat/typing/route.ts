import { publishTyping } from "@/entities/user";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 8.12. 입력 중, resent every `TYPING_PING_INTERVAL` for as long
 * as composing continues. There is no body and no stop verb: the receiver expires
 * the indicator on silence, so the only thing a client can say is "still going".
 *
 * INFO: No row is written, so this is a POST that reads nothing back and answers
 * 204. The session lookup already carries the preference below, which is why the
 * check costs no query of its own.
 */
export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // WARN: § 12. Enforced here, on the sending side, and not where the indicator renders. The setting means "do not broadcast that I am typing" — filtered at the receiver the signal has already left this user's device, and the other participant's client is the wrong place to be trusted with it.
  if (!user.typingIndicatorEnabled) {
    return new NextResponse(null, { status: 204 });
  }

  await publishTyping(user.id);

  return new NextResponse(null, { status: 204 });
}
