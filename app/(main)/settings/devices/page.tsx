import { listUserSessions } from "@/entities/session";
import { DeviceSettingsPage } from "@/pages/device-settings";
import { requireSessionOrRedirect } from "@/shared/auth";

export default async function DeviceSettingsRoute() {
  // INFO: REQUIREMENTS.md § 12. The session row too, not just the user — the list marks the caller's own device rather than offering to revoke it.
  const { user, session } = await requireSessionOrRedirect();

  return <DeviceSettingsPage sessions={await listUserSessions(user.id, session.id)} />;
}
