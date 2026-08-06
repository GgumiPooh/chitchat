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
import { ViewTransition, type PropsWithChildren } from "react";

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
      {/* WARN: DESIGN.md § 3.4. The height eases and `top` never does — WebKit reports the height in a couple of coarse steps while the keyboard slides, so a raw height snaps the composer into place, whereas `top` is correcting a pan that is already wrong on screen and has to land the same frame. */}
      <div className="fixed inset-x-0 top-[var(--viewport-top,0px)] bottom-0 flex h-[var(--viewport-height,100dvh)] justify-center bg-backdrop transition-[height] duration-200 ease-out">
        <Container
          className="relative flex min-h-0 flex-1 flex-col bg-canvas px-0"
          id={APP_SHELL_ID}
        >
          {/* INFO: DESIGN.md § 4.7. The scroller is the whole animation — a route change mutates its contents, which is what `update` names, and the bars outside it never enter the snapshot. */}
          {/* WARN: The single child has to be a real DOM node the browser can snapshot; wrapping `{children}` instead would name whatever element each screen happens to render first. */}
          {/* WARN: DESIGN.md § 4.7.1. `default: "none"` and never a catch-all animation — `update` names any transition-scoped mutation under this boundary, so a `router.refresh()` after saving a profile would replay the whole route animation for a same-route data refresh. */}
          <ViewTransition
            update={{ "tab-forward": "tab-forward", "tab-back": "tab-back", default: "none" }}
            default="none"
          >
            {/* INFO: DESIGN.md § 3.4., § 3.5. The shell's only scroller. The floating bars sit over it, and `--bottom-inset` is the room it leaves for them. */}
            <main
              className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto pb-(--bottom-inset)"
              id={APP_SCROLL_ID}
            >
              {children}
            </main>
          </ViewTransition>
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
