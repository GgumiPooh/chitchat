import type { NewsArticleId, UserId } from "@/shared/lib";
import { index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { geeknewsArticles } from "./geeknews-articles";
import { users } from "./users";

export const geeknewsReads = pgTable(
  "geeknews_reads",
  {
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: snowflake<NewsArticleId>("article_id")
      .notNull()
      .references(() => geeknewsArticles.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.articleId] }),
    index("geeknews_reads_user_idx").on(table.userId),
  ],
);

export type GeeknewsRead = typeof geeknewsReads.$inferSelect;
export type NewGeeknewsRead = typeof geeknewsReads.$inferInsert;
