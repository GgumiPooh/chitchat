import { hasEventToday } from "@/entities/event";
import { countUnreadMessages } from "@/entities/message";
import { listUsers } from "@/entities/user";
import { ChatStreamProvider } from "@/features/chat-stream";
import { PushSync } from "@/features/push-notifications";
import { requireUserOrRedirect } from "@/shared/auth";
import { APP_SCROLL_ID, APP_SHELL_ID } from "@/shared/config";
import { BottomOverlay, Container, ScrollMemory, VisualViewportSync } from "@/shared/ui";
import { InstallGuide } from "@/widgets/install-guide";
import { TabBar } from "@/widgets/tab-bar";
import type { PropsWithChildren } from "react";

// INFO: The proxy only saw that a cookie exists (REQUIREMENTS.md § 5.2.); this is the real check, and it covers every screen below.
export default async function MainLayout({ children }: PropsWithChildren) {
  const user = await requireUserOrRedirect();
  // INFO: REQUIREMENTS.md § 8.4. Both seed the shell's stream, so every tab starts from the same participant set and unread count the chat screen would have.
  // INFO: REQUIREMENTS.md § 11.5. The calendar dot rides the same render — it is conversation-wide, so it needs no per-user query.
  const [participants, unreadCount, hasTodayEvent] = await Promise.all([
    listUsers(),
    countUnreadMessages(user.id),
    hasEventToday(),
  ]);

  return (
    // INFO: DESIGN.md § 3.4. The one element sized to the visual viewport — `100dvh` is only the pre-hydration fallback, since it does not shrink for the keyboard on WebKit.
    // WARN: `top` follows `--viewport-top` because a `fixed` box is laid out against the layout viewport — while WebKit holds a pan the shell would otherwise sit off the top of what the user can see, and resetting the document scroll cannot correct an offset that is not document scroll.
    <ChatStreamProvider
      currentUserId={user.id}
      initialParticipants={participants}
      initialUnreadCount={unreadCount}
    >
      <div className="fixed inset-x-0 top-[var(--viewport-top,0px)] bottom-0 flex h-[var(--viewport-height,100dvh)] justify-center bg-backdrop">
        <Container
          className="relative flex min-h-0 flex-1 flex-col bg-canvas px-0"
          id={APP_SHELL_ID}
        >
          {/* INFO: DESIGN.md § 3.4., § 3.5. The shell's only scroller. The floating bars sit over it, and `--bottom-inset` is the room it leaves for them. */}
          <main
            className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto pb-(--bottom-inset)"
            id={APP_SCROLL_ID}
          >
            {children}
          </main>
          <BottomOverlay>
            <InstallGuide />
            <TabBar hasEventToday={hasTodayEvent} />
          </BottomOverlay>
        </Container>
        <VisualViewportSync />
        <ScrollMemory />
        <PushSync />
      </div>
    </ChatStreamProvider>
  );
}
