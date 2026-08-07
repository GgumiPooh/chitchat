import { hasEventToday } from "@/entities/event";
import { countUnreadMessages } from "@/entities/message";
import { listUsers } from "@/entities/user";
import { ChatStreamProvider } from "@/features/chat-stream";
import { PushSync } from "@/features/push-notifications";
import { ProfileViewerProvider } from "@/features/view-profile";
import { requireUserOrRedirect } from "@/shared/auth";
import { APP_SCROLL_ID, APP_SHELL_ID } from "@/shared/config";
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
      {/* INFO: REQUIREMENTS.md § 12.3. Inside the stream provider, because the profile it draws is resolved against the live participant set; outside the shell box, because the overlay portals into that box rather than nesting in it. */}
      <ProfileViewerProvider currentUserId={user.id}>
        {/* WARN: DESIGN.md § 3.4. The height eases and `top` never does — WebKit reports the height in a couple of coarse steps while the keyboard slides, so a raw height snaps the composer into place, whereas `top` is correcting a pan that is already wrong on screen and has to land the same frame. */}
        <div className="fixed inset-x-0 top-[var(--viewport-top,0px)] bottom-0 flex h-[var(--viewport-height,100dvh)] justify-center bg-backdrop transition-[height] duration-200 ease-out">
          <Container
            className="relative flex min-h-0 flex-1 flex-col bg-canvas px-0"
            id={APP_SHELL_ID}
          >
            {/* INFO: DESIGN.md § 3.4., § 3.5. The shell's only scroller. The floating bars sit over it, and `RouteTransition` trails the room it leaves for them. */}
            {/* WARN: DESIGN.md § 3.5. The clearance cannot be this element's `pb-(--bottom-inset)` — `RouteTransition` is a `min-h-0` flex item, so a taller screen overflows *out* of it, past end padding that is only laid out after in-flow content. */}
            {/* WARN: DESIGN.md § 4.7.1. `overflow-x: clip`, not `hidden` — the route slide translates the screen 24px past the shell edge, and on a scroller that already scrolls vertically `overflow-x` computes to `auto`, which would make that a real horizontal scroll offset for the length of every navigation. */}
            <main
              className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto"
              id={APP_SCROLL_ID}
            >
              {/* INFO: DESIGN.md § 4.7.1. Inside the scroller, so the animation is the screen's alone — the scroller keeps its own scroll position and the bars outside it are untouched. */}
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
        </div>
      </ProfileViewerProvider>
    </ChatStreamProvider>
  );
}
