import { request } from "@/shared/api";
import { EMOTICON_PREFS_URL } from "@/shared/config";
import type { EmoticonPackId, Nullable } from "@/shared/lib";

/** REQUIREMENTS.md § 13.5. One move — the pack that moved and the pack it landed behind, `null` for the front of the list. */
export async function saveEmoticonPackOrder(
  packId: EmoticonPackId,
  after: Nullable<string>,
): Promise<void> {
  const response = await request(EMOTICON_PREFS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId, after }),
  });

  if (!response.ok) {
    throw new Error(`PUT ${EMOTICON_PREFS_URL} responded ${response.status}`);
  }
}

export async function saveEmoticonPackEnabled(
  packId: EmoticonPackId,
  enabled: boolean,
): Promise<void> {
  const response = await request(EMOTICON_PREFS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId, enabled }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${EMOTICON_PREFS_URL} responded ${response.status}`);
  }
}
