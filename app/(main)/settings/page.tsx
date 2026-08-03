import { SettingsPage } from "@/pages/settings";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  // INFO: `requireUserOrRedirect` is request-cached, so this reuses the `(main)` layout's session lookup.
  return <SettingsPage user={await requireUserOrRedirect()} />;
}
