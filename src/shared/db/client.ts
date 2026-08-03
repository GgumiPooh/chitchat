import "server-only";

import { ensureEnv } from "@/shared/config";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

// WARN: Dev HMR re-evaluates this module; without the global the pool count climbs until Postgres refuses connections.
const globalForDb = globalThis as typeof globalThis & { jandhDb?: Database };

/**
 * The pooled connection (REQUIREMENTS.md § 6.). `LISTEN`/`NOTIFY` and migrations
 * must not use it — they need `DATABASE_URL_UNPOOLED`.
 */
export function getDb(): Database {
  if (!globalForDb.jandhDb) {
    const client = postgres(ensureEnv("DATABASE_URL"), {
      // WARN: Neon's transaction-mode pooler cannot hold server-side prepared statements across queries.
      prepare: false,
    });

    globalForDb.jandhDb = drizzle(client, { schema });
  }

  return globalForDb.jandhDb;
}
