import { listMessages } from "@/entities/message";
import { toMediaUrl } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { preload } from "react-dom";
import { ChatScreen } from "./chat-screen";

export type ChatPageProps = {
  className?: string;
  currentUserId: string;
  /** REQUIREMENTS.md § 12.2. The signed-in user's own wallpaper, read from `users` by the route. */
  backgroundMediaId: Nullable<string>;
};

export async function ChatPage({ className, currentUserId, backgroundMediaId }: ChatPageProps) {
  // WARN: REQUIREMENTS.md § 12.2. Emitted from the server render, not requested by the `<img>` on mount. The wallpaper is drawn across the whole screen behind the first bubble the user sees, so a request that waits for hydration paints the flat `chat-canvas` first and swaps the photo in underneath a conversation the reader is already looking at.
  // WARN: Above the `await`, not below it. React only flushes the `<link rel=preload>` once this component resolves, so ordering it after the query holds the full-resolution wallpaper behind a database round trip it does not depend on.
  if (backgroundMediaId) {
    preload(toMediaUrl(backgroundMediaId, "original"), { as: "image", fetchPriority: "high" });
  }

  // INFO: The newest page comes from the server render, so opening the tab costs no client round trip before the first paint. Participants are the shell's (§ 8.4.), since every tab needs them for the in-app banner.
  const initialMessages = await listMessages();

  return (
    <ChatScreen
      className={className}
      currentUserId={currentUserId}
      initialMessages={initialMessages}
      backgroundMediaId={backgroundMediaId}
    />
  );
}
