CREATE TABLE "message_reactions" (
	"message_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"reaction_type" text NOT NULL,
	"emoji" text,
	"emoticon_item_id" bigint
);
--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_emoticon_item_id_emoticon_items_id_fk" FOREIGN KEY ("emoticon_item_id") REFERENCES "public"."emoticon_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_reactions_message_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_emoji_uniq" ON "message_reactions" USING btree ("message_id","user_id","emoji") WHERE "reaction_type" = 'emoji';--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_emoticon_uniq" ON "message_reactions" USING btree ("message_id","user_id","emoticon_item_id") WHERE "reaction_type" = 'emoticon';--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_payload_check" CHECK (
  ("reaction_type" = 'emoji' AND "emoji" IS NOT NULL AND "emoticon_item_id" IS NULL) OR
  ("reaction_type" = 'emoticon' AND "emoticon_item_id" IS NOT NULL AND "emoji" IS NULL)
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_message_reaction_changed()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('message_changed', json_build_object('id', COALESCE(NEW.message_id, OLD.message_id)::text)::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER message_reactions_notify_changed
AFTER INSERT OR UPDATE OR DELETE ON message_reactions
FOR EACH ROW
EXECUTE FUNCTION notify_message_reaction_changed();
