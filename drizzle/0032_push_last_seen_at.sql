-- INFO: REQUIREMENTS.md § 16.1. Dates the last launch of the app on this installation, which is what retires a device nobody opens any more — a delivery failure never reveals one, since the push service accepts for it indefinitely.
-- INFO: `DEFAULT now()` backfills every existing row with a full lease rather than a null, so the deploy cannot retire a device on the strength of a column that did not exist when it was last opened.
-- WARN: Deployable ahead of the code and safe behind it — the old bundle neither writes nor reads this column, and the defaulted value keeps the send path working through the whole gap.
ALTER TABLE "push_subscriptions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
