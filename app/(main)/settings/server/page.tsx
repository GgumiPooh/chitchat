import { ServerSettingsPage } from "@/pages/server-settings";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function ServerSettingsRoute() {
  // INFO: REQUIREMENTS.md § 12.4. The screen holds no per-user state; the redirect is the whole reason the route awaits a session.
  await requireUserOrRedirect();

  return <ServerSettingsPage />;
}
