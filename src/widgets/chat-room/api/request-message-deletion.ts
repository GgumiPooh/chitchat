import { request } from "@/shared/api";
import type { MessageId } from "@/shared/lib";

export async function requestMessageDeletion(id: MessageId): Promise<void> {
  const response = await request(`/api/messages/${id}`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(`DELETE /api/messages/${id} responded ${response.status}`);
  }
}
