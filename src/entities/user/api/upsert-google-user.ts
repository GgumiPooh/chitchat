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

  // WARN: `google_sub` is the identity, not the email — Google lets an account change address, and matching on email would collide with the existing row's unique `google_sub`.
  const [bySub] = await db.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1);

  if (bySub) {
    if (bySub.email === identity.email) {
      return bySub;
    }

    const [reemailed] = await db
      .update(users)
      .set({ email: identity.email })
      .where(eq(users.id, bySub.id))
      .returning();

    return reemailed;
  }

  // INFO: An allow-listed address whose `google_sub` we have never seen — a re-created Google account, or a row seeded before its first login.
  const [byEmail] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);

  if (byEmail) {
    const [relinked] = await db
      .update(users)
      .set({ googleSub: identity.sub })
      .where(eq(users.id, byEmail.id))
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
