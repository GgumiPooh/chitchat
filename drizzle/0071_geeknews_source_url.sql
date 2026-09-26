ALTER TABLE "geeknews_articles" RENAME COLUMN "url" TO "source_url";--> statement-breakpoint
ALTER TABLE "geeknews_articles" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "geeknews_articles" RENAME COLUMN "geeknews_url" TO "url";
