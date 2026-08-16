import { ServerSettingsPage } from "@/pages/server-settings";
import { requireUserOrRedirect } from "@/shared/auth";
import { isOpsDispatchConfigured } from "@/shared/ops";

export default async function ServerSettingsRoute() {
  // INFO: REQUIREMENTS.md § 12.4. The screen holds no per-user state; the redirect is the whole reason the route awaits a session.
  await requireUserOrRedirect();

  // INFO: Read here because the screen is a client component and the dispatch token is a server secret — the flag crosses as a prop, never the credential.
  return <ServerSettingsPage isOpsAvailable={isOpsDispatchConfigured()} />;
}
