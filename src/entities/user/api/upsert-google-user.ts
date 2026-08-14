import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, nextSnowflake, users, type User } from "@/shared/db";
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

  // INFO: An allow-listed address whose `google_sub` we have never seen — the account behind it was deleted and re-created, which mints a new subject id for the same address.
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
      id: nextSnowflake<UserId>(),
      email: identity.email,
      googleSub: identity.sub,
      // INFO: REQUIREMENTS.md § 8.8. The epoch, so everything sent before this person's first login counts as unread rather than silently read. `last_read_message_id` says the same by staying NULL, which is why it is not set here.
      // TODO: RESTRUCTURE.md § 3.5. Drops out with the column in migration B; until then `last_read_at` is still NOT NULL and still read by the deployed build.
      lastReadAt: new Date(0),
      nickname: identity.name?.trim() || identity.email.split("@")[0],
    })
    .returning();

  return created;
}
