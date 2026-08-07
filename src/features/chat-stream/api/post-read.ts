import { request } from "@/shared/api";
import { CHAT_READ_PATH } from "@/shared/config";

/**
 * REQUIREMENTS.md § 8.8. Advances the read cursor. Carries no timestamp — the
 * server stamps `now()` itself, so a device with a skewed clock cannot push the
 * cursor into the future and hide messages it never showed.
 */
export async function postRead(): Promise<void> {
  const response = await request(CHAT_READ_PATH, { method: "POST", keepalive: true });

  if (!response.ok) {
    throw new Error(`POST ${CHAT_READ_PATH} responded ${response.status}`);
  }
}
