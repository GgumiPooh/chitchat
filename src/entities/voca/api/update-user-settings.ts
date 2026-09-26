import "server-only";

import { getDb, vocaUserSettings } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { toVocaUserSettings, type VocaUserSettings } from "../model/types";
import { getVocaUserSettings } from "./get-user-settings";

export type UpdateVocaUserSettingsInput = Partial<Omit<VocaUserSettings, "userId">>;

export async function updateVocaUserSettings(
  userId: UserId,
  patch: UpdateVocaUserSettingsInput,
): Promise<VocaUserSettings> {
  const db = getDb();
  await getVocaUserSettings(userId);

  const [updated] = await db
    .update(vocaUserSettings)
    .set(patch)
    .where(eq(vocaUserSettings.userId, userId))
    .returning();

  return toVocaUserSettings(updated);
}
