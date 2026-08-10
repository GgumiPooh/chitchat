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
import { LiveTabBar, TabBar } from "@/widgets/tab-bar";
import { Suspense, type PropsWithChildren } from "react";

/**
 * The shell every tab screen renders inside.
 *
 * INFO: Everything here is session-free on purpose, so it is what `cacheComponents`
 * prerenders into the static shell — the column, its canvas and its edge, plus the
 * three client utilities that read no user and write nothing.
 *
 * WARN: That last clause is the test, and `PushSync` fails it — it stays inside
 * `SessionShell`. REQUIREMENTS.md § 5.2. lets a revoked session reach this shell, and
 * a `PushSync` mounted out here would sweep § 16.1.'s delivered banners and POST a
 * subscription before `SessionShell` had a chance to bounce it.
 *
 * WARN: The `<Suspense>` below covers `{children}` and there is no arrangement in
 * which it does not. `ChatStreamProvider` is seeded from the cookie and wraps every
 * screen *and* the tab bar's badge, so a boundary that let the pages through would
 * have to leave the providers above it — which is the one place the session cannot
 * be read. What was pushed out of it instead is everything that neither reads a user
 * nor acts on one.
 */
export default function MainLayout({ children }: PropsWithChildren) {
  return (
    <>
      {/* INFO: DESIGN.md § 3.3. The column is in flow and the document scrolls it, so Safari's bottom toolbar collapses the way it does on any ordinary page. */}
      {/* WARN: A hairline down each side, not a `backdrop` gutter — the gutter colour would be what iOS 26 Safari tints its chrome with, and neither a border nor a shadow is ever sampled. */}
      {/* INFO: DESIGN.md § 3.3. `shell-edge` draws it 1px *outside* the box, so the phone — where the column is the full width — never sees it. */}
      {/* WARN: Outside the boundary, so `ShellOverlay`'s portal target exists in the prerendered HTML and the shell box is not torn down and rebuilt when the session lands. */}
      <Container
        className="relative flex min-h-dvh flex-col bg-canvas px-0 shell-edge"
        id={APP_SHELL_ID}
      >
        <Suspense fallback={<ShellFallback />}>
          <SessionShell>{children}</SessionShell>
        </Suspense>
      </Container>
      {/* INFO: All three are inert until the user acts — they publish viewport properties, swallow a stray drop and remember a scroll offset. None of them writes to the server or to the OS, which is what lets them sit ahead of the session check. */}
      <VisualViewportSync />
      {/* INFO: REQUIREMENTS.md § 9.2. Shell-level, because a stray drop navigates the PWA away from every screen — not only from the two that take one. */}
      <FileDropGuard />
      {/* WARN: `usePathname` is runtime data on a route with a dynamic segment — `/settings/emoticons/[packId]` prerenders no path for it to read. It renders nothing either way, so the boundary costs a `null` fallback and nothing else. */}
      <Suspense fallback={null}>
        <ScrollMemory />
      </Suspense>
    </>
  );
}

/**
 * What the static shell holds while the session and its four queries are in flight.
 *
 * INFO: DESIGN.md § 7.8. The bar is the real `TabBar` rather than a skeleton of one —
 * its chrome is four glyphs and four labels that depend on nothing, and `usePathname`
 * fills the travelling fill in for free. Only the § 8.8. badge and the § 11.5. dot are
 * missing, and both are `absolute` over a glyph, so neither has a box to shift.
 *
 * INFO: AGENTS.md § 1.2. No `className` — it renders two siblings and no root for one
 * to land on, and this file is its only caller.
 */
function ShellFallback() {
  return (
    <>
      {/* INFO: The column's flow geometry, so the screen that streams in lands in the box the fallback was holding. */}
      <main className="flex flex-1 flex-col" />
      <BottomOverlay>
        {/* WARN: The bar reads `usePathname` to fill the active tab, which is runtime data on `/settings/emoticons/[packId]` — that one route prerenders no bar and streams it with the rest. */}
        <Suspense fallback={null}>
          <TabBar />
        </Suspense>
      </BottomOverlay>
    </>
  );
}

// INFO: AGENTS.md § 1.2. No `className`, for `ShellFallback`'s reason — it renders the same two siblings.
type SessionShellProps = PropsWithChildren;

// INFO: The proxy only saw that a cookie exists (REQUIREMENTS.md § 5.2.); this is the real check, and it covers every screen below.
async function SessionShell({ children }: SessionShellProps) {
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
      {/* INFO: REQUIREMENTS.md § 12.3. Inside the stream provider, because the profile it draws is resolved against the live participant set. */}
      {/* INFO: It sits *inside* `#app-shell` now rather than beside it, which its overlay's portal does not mind — `createPortal` into an ancestor node lands the overlay in exactly the same place, and the shell box has to stay outside the boundary above. */}
      <ProfileViewerProvider currentUserId={user.id}>
        {/* WARN: No `overflow` of any kind. The route slide's horizontal clip lives on `body` instead — an overflow here makes this the scrollport a `sticky` header resolves against, and the header then has nothing to stick to (DESIGN.md § 3.3.). */}
        <main className="flex flex-1 flex-col">
          <RouteTransition>{children}</RouteTransition>
        </main>
        <BottomOverlay>
          <InstallGuide />
          <LiveTabBar hasEventToday={hasTodayEvent} />
        </BottomOverlay>
        {/* WARN: REQUIREMENTS.md § 16.1. Inside the boundary, unlike the shell's other client utilities. It sweeps Notification Center and POSTs this device's subscription on mount, so mounting it before the session is proven would clear a revoked user's banners and spend a 401 on the way to `/login` (§ 5.2.). */}
        <PushSync />
      </ProfileViewerProvider>
    </ChatStreamProvider>
  );
}
