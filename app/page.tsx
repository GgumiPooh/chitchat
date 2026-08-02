import { requireUserOrRedirect } from "@/shared/auth";
import { HOME_ROUTE } from "@/shared/config";
import { redirect } from "next/navigation";

// INFO: Only reachable with a session cookie present — the proxy sends everyone else to `/login`.
export default async function Page() {
  await requireUserOrRedirect();

  redirect(HOME_ROUTE);
}
