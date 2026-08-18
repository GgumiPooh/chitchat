CREATE TABLE "user_emoticon_favorites" (
	"id" bigint PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"item_id" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_emoticon_favorites" ADD CONSTRAINT "user_emoticon_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emoticon_favorites" ADD CONSTRAINT "user_emoticon_favorites_item_id_emoticon_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emoticon_favorites_user_id_item_id_idx" ON "user_emoticon_favorites" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE INDEX "user_emoticon_favorites_user_id_id_idx" ON "user_emoticon_favorites" USING btree ("user_id","id" desc);
