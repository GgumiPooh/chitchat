import type { UserId } from "@/shared/lib";
import { boolean, pgTable } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

export const geeknewsSubscriptions = pgTable("geeknews_subscriptions", {
  userId: snowflake<UserId>("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
});

export type GeeknewsSubscription = typeof geeknewsSubscriptions.$inferSelect;
export type NewGeeknewsSubscription = typeof geeknewsSubscriptions.$inferInsert;
