import { NotificationsSettingsPage } from "@/pages/notifications-settings";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  await requireUserOrRedirect();

  return <NotificationsSettingsPage />;
}
