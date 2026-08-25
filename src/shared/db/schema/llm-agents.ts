import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// INFO: The AI-answer fallback chain. Priority order with a per-row cooldown, so a 429 on one provider tries the next rather than failing the question.
export const llmAgents = pgTable(
  "llm_agents",
  {
    // WARN: Text, not an enum — a new provider is a new row, and an enum would need a migration for it.
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    // INFO: Part of the primary key, not just a column — a provider/model pair is reused across two different keys (a paid tier and a free one) more often than a key is reused across two models.
    apiKey: text("api_key").notNull(),
    // INFO: Higher tried first; ties broken by (provider, model, api_key) in the caller's ORDER BY.
    priority: integer("priority").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // INFO: Stamped on a 429; an agent past this instant is eligible again.
    disabledUntil: timestamp("disabled_until", { withTimezone: true }),
    // INFO: Provider-specific knobs (temperature, safety settings, …) — jsonb so a new one needs no migration either.
    config: jsonb("config").notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.provider, table.model, table.apiKey] })],
);

export type LlmAgent = typeof llmAgents.$inferSelect;
