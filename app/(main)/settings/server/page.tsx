import { ServerSettingsPage } from "@/pages/server-settings";
import { requireUserOrRedirect } from "@/shared/auth";
import { isOpsConfigured } from "@/shared/ops";

export default async function ServerSettingsRoute() {
  // INFO: REQUIREMENTS.md § 12.4. The screen holds no per-user state; the redirect is the whole reason the route awaits a session.
  await requireUserOrRedirect();

  // INFO: Read here because the screen is a client component and `OPS_API_URL` is a server variable — the flag crosses as a prop rather than the address.
  return <ServerSettingsPage isOpsAvailable={isOpsConfigured()} />;
}
