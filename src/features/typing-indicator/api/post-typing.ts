import { CHAT_TYPING_PATH } from "@/shared/config";

/**
 * REQUIREMENTS.md § 8.12. One ping, no body. Failure is not reported and not
 * retried — the next ping is `TYPING_PING_INTERVAL` away and says the same thing,
 * and a signal nobody heard expires on its own at the receiver.
 */
export async function postTyping(): Promise<void> {
  await fetch(CHAT_TYPING_PATH, { method: "POST" });
}
