import { CHAT_TYPING_PATH } from "@/shared/config";

/**
 * REQUIREMENTS.md § 8.12. One ping, no body. Failure is not reported and not
 * retried — the next ping is `TYPING_PING_INTERVAL` away and says the same thing,
 * and a signal nobody heard expires on its own at the receiver.
 */
export async function postTyping(): Promise<void> {
  await fetch(CHAT_TYPING_PATH, { method: "POST" });
}

/**
 * REQUIREMENTS.md § 8.12. Composing ended.
 *
 * INFO: `keepalive`, because the most common way to stop typing is to send the
 * message — and a navigation or a backgrounding immediately after would otherwise
 * cancel the request in flight, leaving the indicator up for the full
 * `TYPING_TIMEOUT` behind a message that has already arrived.
 */
export async function deleteTyping(): Promise<void> {
  await fetch(CHAT_TYPING_PATH, { method: "DELETE", keepalive: true });
}
