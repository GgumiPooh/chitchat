import { ChatSettingsPage } from "@/pages/chat-settings";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  await requireUserOrRedirect();

  return <ChatSettingsPage />;
}
