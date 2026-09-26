import { getVocaUserSettings } from "@/entities/voca";
import { VocaSettingsPage } from "@/pages/voca";
import { requireUserOrRedirect } from "@/shared/auth";
import { VOCA_REMINDER_COOKIE_NAME } from "@/shared/config";
import { cookies } from "next/headers";

export default async function Page() {
  const user = await requireUserOrRedirect();
  const [settings, cookieStore] = await Promise.all([getVocaUserSettings(user.id), cookies()]);

  const reminderCookie = cookieStore.get(VOCA_REMINDER_COOKIE_NAME)?.value;
  const effectiveSettings =
    reminderCookie === "true" || reminderCookie === "false"
      ? { ...settings, reminderEnabled: reminderCookie === "true" }
      : settings;

  return <VocaSettingsPage initialSettings={effectiveSettings} />;
}
