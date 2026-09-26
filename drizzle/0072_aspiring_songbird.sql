CREATE TABLE "voca_cards" (
	"id" bigint PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"due_at" timestamp with time zone,
	"due_date" text,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"sentence" text NOT NULL,
	"target_word" text NOT NULL,
	"pos" text NOT NULL,
	"pronunciation" text NOT NULL,
	"korean_meaning" text NOT NULL,
	"english_definition" text NOT NULL,
	"confusable" text,
	"collocations" text NOT NULL,
	"word_family" text,
	"examples" text NOT NULL,
	"audio_url" text,
	"sentence_audio_url" text,
	"audio_media_id" bigint,
	"sentence_audio_media_id" bigint,
	"tags" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "voca_reviews" (
	"id" bigint PRIMARY KEY NOT NULL,
	"card_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"rating" integer NOT NULL,
	"state_before" text NOT NULL,
	"stability_before" real NOT NULL,
	"difficulty_before" real NOT NULL,
	"state_after" text NOT NULL,
	"stability_after" real NOT NULL,
	"difficulty_after" real NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"time_spent_ms" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voca_user_settings" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"daily_new_cards" integer DEFAULT 15 NOT NULL,
	"daily_review_limit" integer,
	"reminder_enabled" boolean DEFAULT true NOT NULL,
	"last_reminded_date" text,
	"autoplay_audio" boolean DEFAULT true NOT NULL,
	"desired_retention" real DEFAULT 0.9 NOT NULL,
	"today_extra_new_cards" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_scope_check";--> statement-breakpoint
ALTER TABLE "voca_cards" ADD CONSTRAINT "voca_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voca_cards" ADD CONSTRAINT "voca_cards_audio_media_id_media_id_fk" FOREIGN KEY ("audio_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voca_cards" ADD CONSTRAINT "voca_cards_sentence_audio_media_id_media_id_fk" FOREIGN KEY ("sentence_audio_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voca_reviews" ADD CONSTRAINT "voca_reviews_card_id_voca_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."voca_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voca_reviews" ADD CONSTRAINT "voca_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voca_user_settings" ADD CONSTRAINT "voca_user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voca_cards_user_due_date_idx" ON "voca_cards" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "voca_cards_user_target_word_idx" ON "voca_cards" USING btree ("user_id","target_word");--> statement-breakpoint
CREATE INDEX "voca_reviews_user_reviewed_at_idx" ON "voca_reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "voca_reviews_card_reviewed_at_idx" ON "voca_reviews" USING btree ("card_id","reviewed_at");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_scope_check" CHECK ("scope" in ('chat', 'avatar', 'background', 'emoticon', 'voca'));