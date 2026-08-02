import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/shared/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    // WARN: The unpooled string — drizzle-kit issues DDL that a transaction-mode pooler breaks (REQUIREMENTS.md § 6.).
    url: process.env.DATABASE_URL_DIRECT!,
  },
});
