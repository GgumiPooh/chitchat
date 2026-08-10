-- INFO: REQUIREMENTS.md § 16.1. 알림 소리 per browser installation. `DEFAULT true` is what every existing row takes, so a device that never opens 설정 keeps sounding exactly as it did before this column existed.
-- WARN: Deployable ahead of the code and safe behind it — the column is defaulted and never read by the old bundle, so the send path keeps working through the whole gap between the migration and the deploy.
ALTER TABLE "push_subscriptions" ADD COLUMN "sound_enabled" boolean DEFAULT true NOT NULL;
