CREATE TABLE "geeknews_articles" (
	"id" bigint PRIMARY KEY NOT NULL,
	"geeknews_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"geeknews_url" text NOT NULL,
	"summary" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "geeknews_articles_geeknews_id_unique" UNIQUE("geeknews_id")
);
--> statement-breakpoint
CREATE TABLE "geeknews_reads" (
	"user_id" bigint NOT NULL,
	"article_id" bigint NOT NULL,
	CONSTRAINT "geeknews_reads_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "geeknews_subscriptions" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geeknews_reads" ADD CONSTRAINT "geeknews_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geeknews_reads" ADD CONSTRAINT "geeknews_reads_article_id_geeknews_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."geeknews_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geeknews_subscriptions" ADD CONSTRAINT "geeknews_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geeknews_articles_published_at_idx" ON "geeknews_articles" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "geeknews_reads_user_idx" ON "geeknews_reads" USING btree ("user_id");