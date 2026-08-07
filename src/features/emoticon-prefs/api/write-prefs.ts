import { request } from "@/shared/api";
import { EMOTICON_PREFS_PATH } from "@/shared/config";

/** REQUIREMENTS.md § 13.5. The whole ordered list — `sort_order` is positional, so one move renumbers everything after it. */
export async function saveEmoticonPackOrder(packIds: string[]): Promise<void> {
  const response = await request(EMOTICON_PREFS_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packIds }),
  });

  if (!response.ok) {
    throw new Error(`PUT ${EMOTICON_PREFS_PATH} responded ${response.status}`);
  }
}

export async function saveEmoticonPackEnabled(packId: string, enabled: boolean): Promise<void> {
  const response = await request(EMOTICON_PREFS_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId, enabled }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${EMOTICON_PREFS_PATH} responded ${response.status}`);
  }
}
