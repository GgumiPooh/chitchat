import { request } from "@/shared/api";
import type { EmoticonItemId, MessageId } from "@/shared/lib";

// WARN: REQUIREMENTS.md § 13. The emoticons go with the text and are never left out. The route pairs them against the placeholders the correction now holds, so an omitted array is a correction that keeps none — and one that disagrees is a 400.
export async function requestMessageEdit(
  id: MessageId,
  text: string,
  inlineEmoticonItemIds: EmoticonItemId[],
): Promise<void> {
  const response = await request(`/api/messages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, inlineEmoticonItemIds }),
  });

  if (!response.ok) {
    throw new Error(`PATCH /api/messages/${id} responded ${response.status}`);
  }
}
