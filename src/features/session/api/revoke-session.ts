import { request } from "@/shared/api";
import { SESSIONS_PATH } from "@/shared/config";
import type { SessionId } from "@/shared/lib";

/** REQUIREMENTS.md § 12. Signs one other device out. Throws on anything but a 204. */
export async function revokeSession(sessionId: SessionId): Promise<void> {
  const path = `${SESSIONS_PATH}/${sessionId}`;
  const response = await request(path, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(`DELETE ${path} responded ${response.status}`);
  }
}
