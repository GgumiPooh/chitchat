import { listMessages, toMessagePayload } from "@/entities/message";
import { toMediaUrl } from "@/shared/config";
import type { Maybe, MessageId, Nullable, UserId } from "@/shared/lib";
import { preload } from "react-dom";
import { ChatScreen } from "./chat-screen";

export type ChatPageProps = {
  className?: string;
  currentUserId: UserId;
  /**
   * REQUIREMENTS.md § 12.2. The room's shared wallpaper, for the preload alone.
   *
   * WARN: It is deliberately not handed further down. `ChatRoom` reads the live
   * value out of the stream provider, because either participant can change it and a
   * prop from this render would only move on a navigation.
   */
  backgroundMediaId: Nullable<string>;
  /** REQUIREMENTS.md § 10. A message the screen was opened on, validated by the route. */
  jumpMessageId?: Maybe<MessageId>;
};

export async function ChatPage({
  className,
  currentUserId,
  backgroundMediaId,
  jumpMessageId,
}: ChatPageProps) {
  // WARN: REQUIREMENTS.md § 12.2. Emitted from the server render, not requested by the `<img>` on mount. The wallpaper is drawn across the whole screen behind the first bubble the user sees, so a request that waits for hydration paints the flat `chat-canvas` first and swaps the photo in underneath a conversation the reader is already looking at.
  // WARN: Above the `await`, not below it. React only flushes the `<link rel=preload>` once this component resolves, so ordering it after the query holds the full-resolution wallpaper behind a database round trip it does not depend on.
  if (backgroundMediaId) {
    preload(toMediaUrl(backgroundMediaId, "original"), { as: "image", fetchPriority: "high" });
  }

  // INFO: The newest page comes from the server render, so opening the tab costs no client round trip before the first paint. Participants are the shell's (§ 8.4.), since every tab needs them for the in-app banner.
  // INFO: REQUIREMENTS.md § 13. Through the payload builder, so this path carries its emoticons exactly as the fetched pages do — it is the only one whose map arrives as props rather than as a response.
  const { messages, emoticons } = await toMessagePayload(await listMessages());

  return (
    <ChatScreen
      className={className}
      currentUserId={currentUserId}
      initialMessages={messages}
      initialEmoticons={emoticons}
      jumpMessageId={jumpMessageId}
    />
  );
}
