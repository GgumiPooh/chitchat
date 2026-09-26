import "server-only";

import { getDb, vocaUserSettings } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { toVocaUserSettings, type VocaUserSettings } from "../model/types";

export async function getVocaUserSettings(userId: UserId): Promise<VocaUserSettings> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(vocaUserSettings)
    .where(eq(vocaUserSettings.userId, userId));

  if (existing) {
    return toVocaUserSettings(existing);
  }

  const [inserted] = await db
    .insert(vocaUserSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return toVocaUserSettings(inserted);
  }

  const [refetched] = await db
    .select()
    .from(vocaUserSettings)
    .where(eq(vocaUserSettings.userId, userId));

  return toVocaUserSettings(refetched);
}
