import { listUserSessions } from "@/entities/session";
import { SecuritySettingsPage } from "@/pages/security-settings";
import { requireSessionOrRedirect } from "@/shared/auth";

export default async function Page() {
  const { user, session } = await requireSessionOrRedirect();
  const sessions = await listUserSessions(user.id, session.id);

  return <SecuritySettingsPage user={user} sessions={sessions} />;
}
