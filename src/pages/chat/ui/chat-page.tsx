import { getCalendarSummary } from "@/entities/event";
import { listMessages, toMessagePayload } from "@/entities/message";
import {
  NOTIFY_MODE_COOKIE_NAME,
  SIDE_PANEL_UPCOMING_PAGE_SIZE,
  toMediaUrl,
  toNotifyMode,
} from "@/shared/config";
import type { Maybe, MessageId, Nullable, UserId } from "@/shared/lib";
import { cookies } from "next/headers";
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
  /** REQUIREMENTS.md § 16.1. Whether that message is a 나에게만 보내기 row — the mode the jump and this render both filter by. */
  jumpOnlyMe?: boolean;
};

export async function ChatPage({
  className,
  currentUserId,
  backgroundMediaId,
  jumpMessageId,
  jumpOnlyMe,
}: ChatPageProps) {
  // WARN: REQUIREMENTS.md § 12.2. Emitted from the server render, not requested by the `<img>` on mount. The wallpaper is drawn across the whole screen behind the first bubble the user sees, so a request that waits for hydration paints the flat `chat-canvas` first and swaps the photo in underneath a conversation the reader is already looking at.
  // WARN: Above the `await`, not below it. React only flushes the `<link rel=preload>` once this component resolves, so ordering it after the query holds the full-resolution wallpaper behind a database round trip it does not depend on.
  if (backgroundMediaId) {
    preload(toMediaUrl(backgroundMediaId, "original"), { as: "image", fetchPriority: "high" });
  }

  // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — read the cookie to seed the initial page with only private rows when that mode is active, preventing a short client-filtered page from triggering redundant upward fetches.
  const cookieStore = await cookies();
  const notifyMode = toNotifyMode(cookieStore.get(NOTIFY_MODE_COOKIE_NAME)?.value);
  const onlyMeFilter = jumpOnlyMe ?? notifyMode === "onlyMe";

  // INFO: The newest page comes from the server render, so opening the tab costs no client round trip before the first paint. Participants are the shell's (§ 8.4.), since every tab needs them for the in-app banner.
  // INFO: REQUIREMENTS.md § 13. Through the payload builder, so this path carries its emoticons exactly as the fetched pages do — it is the only one whose map arrives as props rather than as a response.
  // WARN: REQUIREMENTS.md § 11.5.1. In parallel, and the summary is not optional to the first paint: the header's bloom is a property of the render itself, so a summary fetched after hydration would light the button a beat after the reader has already looked at it.
  const [{ messages, emoticons }, summary] = await Promise.all([
    listMessages({ currentUserId, onlyMeFilter }).then(toMessagePayload),
    // WARN: REQUIREMENTS.md § 11.5.1. One past the page the side panel draws, exactly as the client's own fetches ask for — seeded with the bare page there is no row to prove a next one exists, so 더 보기 is missing until the first refresh puts it there.
    // INFO: The side panel's page, on every width — the mobile card slices its `MAX_UPCOMING_EVENTS` off the same rows, and a page this size is cheaper than a second render path keyed on the panel cookie.
    getCalendarSummary(SIDE_PANEL_UPCOMING_PAGE_SIZE + 1),
  ]);

  return (
    <ChatScreen
      className={className}
      currentUserId={currentUserId}
      initialMessages={messages}
      initialEmoticons={emoticons}
      initialSummary={summary}
      jumpMessageId={jumpMessageId}
      jumpOnlyMe={jumpOnlyMe}
    />
  );
}
