import { CONVERSATION_ID } from "@/shared/config";
// INFO: The `@/shared/db` barrel re-exports `getDb`, whose module imports `server-only` and throws outside Next — this script runs under plain tsx.
// eslint-disable-next-line no-restricted-imports
import { conversations, users } from "@/shared/db/schema";
import { count } from "drizzle-orm";
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

    // INFO: REQUIREMENTS.md § 6. A user row only exists after that person's first login, so participants are created by the OAuth callback, not here.
    const [{ count: participants }] = await db.select({ count: count() }).from(users);

    console.log(`Seeded conversation ${CONVERSATION_ID}; ${participants} user(s) exist.`);
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
