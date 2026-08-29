-- REQUIREMENTS.md § 6. Weekly and monthly cadences beside yearly; projection stays on read.
ALTER TYPE "public"."event_recurrence" ADD VALUE 'weekly' BEFORE 'yearly';--> statement-breakpoint
ALTER TYPE "public"."event_recurrence" ADD VALUE 'monthly' BEFORE 'yearly';
