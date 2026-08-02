import "server-only";

import { getDb, users, type User } from "@/shared/db";
import { eq } from "drizzle-orm";

/**
 * Matches the Google identity to its row, creating it on first login
 * (REQUIREMENTS.md § 5.1.). The nickname is seeded once and never overwritten
 * afterwards — the user owns it from then on (REQUIREMENTS.md § 8.7.).
 */
export async function upsertGoogleUser(identity: {
  sub: string;
  email: string;
  name?: string;
}): Promise<User> {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);

  if (existing) {
    if (existing.googleSub === identity.sub) {
      return existing;
    }

    const [relinked] = await db
      .update(users)
      .set({ googleSub: identity.sub })
      .where(eq(users.id, existing.id))
      .returning();

    return relinked;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: identity.email,
      googleSub: identity.sub,
      nickname: identity.name?.trim() || identity.email.split("@")[0],
    })
    .returning();

  return created;
}
