import type { MessageChanges } from "@/entities/message";
import { request } from "@/shared/api";
import { CHANGED_MESSAGES_PATH } from "@/shared/config";

/** REQUIREMENTS.md § 8.13.1. The oldest and newest rows the window holds, both inclusive. */
export async function fetchChangedMessages(from: number, to: number): Promise<MessageChanges> {
  const response = await request(`${CHANGED_MESSAGES_PATH}?from=${from}&to=${to}`);

  if (!response.ok) {
    throw new Error(`GET ${CHANGED_MESSAGES_PATH} responded ${response.status}`);
  }

  const { changes } = (await response.json()) as { changes: MessageChanges };

  return changes;
}
