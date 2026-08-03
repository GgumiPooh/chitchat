import { CONVERSATION_ID } from "@/shared/config";
// INFO: The `@/shared/db` barrel re-exports `getDb`, whose module imports `server-only` and throws outside Next — this script runs under plain tsx.
// eslint-disable-next-line no-restricted-imports
import { conversationMembers, conversations, users } from "@/shared/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

async function seed() {
  const url = process.env.DATABASE_URL_UNPOOLED?.trim();

  if (!url) {
    throw new Error("DATABASE_URL_UNPOOLED is not set");
  }

  // WARN: The unpooled string (REQUIREMENTS.md § 6.) — this runs alongside migrations, not against the request-time pool.
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    await db.insert(conversations).values({ id: CONVERSATION_ID }).onConflictDoNothing();

    // INFO: A user row only exists after that person's first login, so membership is backfilled here and joined on login by the OAuth callback.
    const members = await db.select({ id: users.id }).from(users);

    if (members.length > 0) {
      await db
        .insert(conversationMembers)
        // INFO: REQUIREMENTS.md § 8.8. The epoch, so a backfilled member starts with the whole history unread.
        .values(
          members.map(({ id }) => ({
            conversationId: CONVERSATION_ID,
            userId: id,
            lastReadAt: new Date(0),
          })),
        )
        .onConflictDoNothing();
    }

    console.log(`Seeded conversation ${CONVERSATION_ID} with ${members.length} member(s).`);
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
