import { request } from "@/shared/api";
import type { MessageId } from "@/shared/lib";

export async function requestMessageEdit(id: MessageId, text: string): Promise<void> {
  const response = await request(`/api/messages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`PATCH /api/messages/${id} responded ${response.status}`);
  }
}
