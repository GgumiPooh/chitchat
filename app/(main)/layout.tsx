import { readChatBackground } from "@/entities/chat-background";
import { hasEventToday } from "@/entities/event";
import { countUnreadMessages } from "@/entities/message";
import { listUsers } from "@/entities/user";
import { ChatStreamProvider } from "@/features/chat-stream";
import { PushSync } from "@/features/push-notifications";
import { ProfileViewerProvider } from "@/features/view-profile";
import { requireUserOrRedirect } from "@/shared/auth";
import { APP_SHELL_ID } from "@/shared/config";
import {
  BottomOverlay,
  Container,
  FileDropGuard,
  RouteTransition,
  ScrollMemory,
  VisualViewportSync,
} from "@/shared/ui";
import { InstallGuide } from "@/widgets/install-guide";
import { TabBar } from "@/widgets/tab-bar";
import { type PropsWithChildren } from "react";

// INFO: The proxy only saw that a cookie exists (REQUIREMENTS.md § 5.2.); this is the real check, and it covers every screen below.
export default async function MainLayout({ children }: PropsWithChildren) {
  const user = await requireUserOrRedirect();
  // INFO: REQUIREMENTS.md § 8.4.2. Both seed the shell's state, which outlives the chat screen the socket itself is scoped to.
  // INFO: REQUIREMENTS.md § 11.5. The calendar dot rides the same render — it is conversation-wide, so it needs no per-user query.
  // INFO: REQUIREMENTS.md § 12.2. The wallpaper is seeded here rather than by the chat screen, because the state it feeds is refreshed by a `user_changed` event that reaches every tab.
  const [participants, unreadCount, hasTodayEvent, chatBackground] = await Promise.all([
    listUsers(),
    countUnreadMessages(user.id),
    hasEventToday(),
    readChatBackground(),
  ]);

  return (
    <ChatStreamProvider
      currentUserId={user.id}
      initialParticipants={participants}
      initialChatBackgroundMediaId={chatBackground?.mediaId ?? null}
      initialChatBackgroundBlurhash={chatBackground?.blurhash ?? null}
      initialUnreadCount={unreadCount}
    >
      {/* INFO: REQUIREMENTS.md § 12.3. Inside the stream provider, because the profile it draws is resolved against the live participant set; outside the shell box, because the overlay portals into that box rather than nesting in it. */}
      <ProfileViewerProvider currentUserId={user.id}>
        {/* INFO: DESIGN.md § 3.3. The column is in flow and the document scrolls it, so Safari's bottom toolbar collapses the way it does on any ordinary page. */}
        {/* WARN: `border-x`, not a `backdrop` gutter — the gutter colour would be what iOS 26 Safari tints its chrome with, and a border-colour is never sampled. */}
        <Container
          className="relative flex min-h-dvh flex-col border-x border-hairline bg-canvas px-0"
          id={APP_SHELL_ID}
        >
          {/* WARN: No `overflow` of any kind. The route slide's horizontal clip lives on `body` instead — an overflow here makes this the scrollport a `sticky` header resolves against, and the header then has nothing to stick to (DESIGN.md § 3.3.). */}
          <main className="flex flex-1 flex-col">
            <RouteTransition>{children}</RouteTransition>
          </main>
          <BottomOverlay>
            <InstallGuide />
            <TabBar hasEventToday={hasTodayEvent} />
          </BottomOverlay>
        </Container>
        <VisualViewportSync />
        {/* INFO: REQUIREMENTS.md § 9.2. Shell-level, because a stray drop navigates the PWA away from every screen — not only from the two that take one. */}
        <FileDropGuard />
        <ScrollMemory />
        <PushSync />
      </ProfileViewerProvider>
    </ChatStreamProvider>
  );
}
