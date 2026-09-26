import type { NewsArticleId } from "@/shared/lib";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";

export const geeknewsArticles = pgTable(
  "geeknews_articles",
  {
    id: snowflake<NewsArticleId>("id").primaryKey(),
    geeknewsId: text("geeknews_id").notNull().unique(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    geeknewsUrl: text("geeknews_url").notNull(),
    summary: text("summary").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("geeknews_articles_published_at_idx").on(table.publishedAt.desc())],
);

export type GeeknewsArticle = typeof geeknewsArticles.$inferSelect;
export type NewGeeknewsArticle = typeof geeknewsArticles.$inferInsert;
