CREATE TYPE "public"."link_preview_kind" AS ENUM('link', 'video');--> statement-breakpoint
CREATE TYPE "public"."link_preview_status" AS ENUM('ok', 'empty', 'failed');--> statement-breakpoint
CREATE TABLE "link_previews" (
	"url" text PRIMARY KEY NOT NULL,
	"status" "link_preview_status" NOT NULL,
	"kind" "link_preview_kind" DEFAULT 'link' NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"site_name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
