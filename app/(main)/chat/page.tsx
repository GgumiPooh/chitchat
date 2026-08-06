import { ChatPage } from "@/pages/chat";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  // INFO: `requireUserOrRedirect` is request-cached, so this reuses the `(main)` layout's session lookup.
  const { chatBackgroundMediaId, id } = await requireUserOrRedirect();

  return <ChatPage currentUserId={id} backgroundMediaId={chatBackgroundMediaId} />;
}
