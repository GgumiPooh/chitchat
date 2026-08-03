import { ChatPage } from "@/pages/chat";

// INFO: The session is resolved once in the `(main)` layout, which redirects before any screen renders.
export default function Page() {
  return <ChatPage />;
}
