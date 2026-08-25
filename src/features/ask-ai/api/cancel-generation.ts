import { request } from "@/shared/api";
import { CHAT_AI_PATH } from "@/shared/config";

/** `DELETE /api/chat/ai` — either participant may call this, not only the one who asked. */
export async function cancelGeneration(streamId: string): Promise<void> {
  await request(CHAT_AI_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ streamId }),
  });
}
