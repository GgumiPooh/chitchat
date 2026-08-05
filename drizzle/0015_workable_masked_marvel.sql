-- REQUIREMENTS.md 10. The keyset cursor crosses the wire as a JS Date, which cannot carry microseconds — so a truncated cursor left the boundary row's siblings comparing greater than it and skipped them for good.
-- Rounding existing values to milliseconds is safe: created_at orders the gallery and labels its month sections, and nothing reads it at finer resolution.
ALTER TABLE "media" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "created_at" SET DEFAULT now();