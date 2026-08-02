import { ChatPage } from "@/pages/chat";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  // INFO: The proxy only saw that a cookie exists (REQUIREMENTS.md § 5.2.); this is the real check.
  return <ChatPage user={await requireUserOrRedirect()} />;
}
