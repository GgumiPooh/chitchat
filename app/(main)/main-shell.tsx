"use client";

import type { Participant } from "@/entities/user";
import { ChatStreamProvider } from "@/features/chat-stream";
import { OfflineSnapshotSync } from "@/features/offline-snapshot";
import { PushSync } from "@/features/push-notifications";
import { ProfileViewerProvider } from "@/features/view-profile";
import { APP_SHELL_ID } from "@/shared/config";
import {
  cn,
  useDecryptedServerPayload,
  type MediaId,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { OfflineNotice } from "@/shared/offline-ux";
import {
  BottomOverlay,
  Container,
  FileDropGuard,
  RouteTransition,
  ScrollMemory,
  SidePanelSync,
  VisualViewportSync,
} from "@/shared/ui";
import { InstallGuide } from "@/widgets/install-guide";
import { OfflineBanner } from "@/widgets/offline-banner";
import { ShortcutGuide } from "@/widgets/shortcut-guide";
import { NavRail, TabBar } from "@/widgets/tab-bar";
import { LoaderCircle } from "lucide-react";
import type { PropsWithChildren } from "react";

export type MainShellSeed = {
  participants: Participant[];
  unreadCount: number;
  hasTodayEvent: boolean;
  chatBackgroundMediaId: Nullable<MediaId>;
  chatBackgroundBlurhash: Nullable<string>;
  llmSystemPrompt: Nullable<string>;
  shareKey: string;
};

export type MainShellProps = PropsWithChildren<{
  className?: string;
  currentUserId: UserId;
  encryptedShell: string;
  isSidePanelClosed: boolean;
}>;

export function MainShell({
  className,
  children,
  currentUserId,
  encryptedShell,
  isSidePanelClosed,
}: MainShellProps) {
  const shell = useDecryptedServerPayload<MainShellSeed>(encryptedShell);

  if (!shell) {
    return (
      <div className={cn("flex min-h-dvh w-full items-center justify-center bg-canvas", className)}>
        <LoaderCircle className="size-6 animate-spin text-meta-soft" aria-hidden />
      </div>
    );
  }

  return (
    <ChatStreamProvider
      currentUserId={currentUserId}
      initialParticipants={shell.participants}
      initialChatBackgroundMediaId={shell.chatBackgroundMediaId}
      initialChatBackgroundBlurhash={shell.chatBackgroundBlurhash}
      initialLlmSystemPrompt={shell.llmSystemPrompt}
      initialUnreadCount={shell.unreadCount}
    >
      {/* INFO: REQUIREMENTS.md § 12.3. Inside the stream provider, because the profile it draws is resolved against the live participant set; outside the shell box, because the overlay portals into that box rather than nesting in it. */}
      <ProfileViewerProvider currentUserId={currentUserId}>
        {/* INFO: DESIGN.md § 3.3. The column is in flow and the document scrolls it, so Safari's bottom toolbar collapses the way it does on any ordinary page. */}
        {/* WARN: A hairline down each side, not a `backdrop` gutter — the gutter colour would be what iOS 26 Safari tints its chrome with, and neither a border nor a shadow is ever sampled. */}
        {/* INFO: DESIGN.md § 3.3. `shell-edge` draws it 1px *outside* the box, so the phone — where the column is the full width — never sees it. */}
        <Container
          className={cn(
            "relative flex min-h-dvh max-w-none flex-col bg-canvas px-0 shell-edge md:pl-(--rail-width)",
            className,
          )}
          id={APP_SHELL_ID}
          data-side-panel={isSidePanelClosed ? "closed" : undefined}
        >
          {/* INFO: AGENTS.md § 4.1. The argued fifth `fixed` element — the document scrolls under it, and `sticky` would need an `h-dvh` wrapper in a column that is already padded to clear it. */}
          <NavRail
            className="hidden md:flex"
            hasEventToday={shell.hasTodayEvent}
            currentUserId={currentUserId}
          />
          {/* WARN: No `overflow` of any kind. The route slide's horizontal clip lives on `body` instead — an overflow here makes this the scrollport a `sticky` header resolves against, and the header then has nothing to stick to (DESIGN.md § 3.3.). */}
          <main className="flex flex-1 flex-col">
            <RouteTransition>{children}</RouteTransition>
          </main>
          <BottomOverlay>
            <ShortcutGuide shareKey={shell.shareKey} />
            <InstallGuide />
            <TabBar hasEventToday={shell.hasTodayEvent} />
          </BottomOverlay>
        </Container>
        <VisualViewportSync />
        <SidePanelSync />
        {/* INFO: REQUIREMENTS.md § 9.2. Shell-level, because a stray drop navigates the PWA away from every screen — not only from the two that take one. */}
        <FileDropGuard />
        <ScrollMemory />
        {/* INFO: Shell-level, so one mount covers all four tabs and 채팅 — it portals into the shell through `ShellOverlay` rather than sitting in any screen's header. */}
        <OfflineBanner />
        {/* WARN: Mounted unconditionally, and deliberately not inside the banner above. Every blocked control points `aria-describedby` here, and the banner only appears a second after the network goes — described against a node that does not exist yet, a control blocked before then reads out with no reason at all. */}
        <OfflineNotice />
        {/* INFO: REQUIREMENTS.md § 16. Shell-level, because the chrome it stores is what every mirror draws — and 설정's mirror is drawn from it alone. */}
        <OfflineSnapshotSync
          participants={shell.participants}
          currentUserId={currentUserId}
          chatBackgroundMediaId={shell.chatBackgroundMediaId}
          chatBackgroundBlurhash={shell.chatBackgroundBlurhash}
          hasEventToday={shell.hasTodayEvent}
        />
        {/* WARN: REQUIREMENTS.md § 16.1. Inside the session gate, and it must stay there. It sweeps Notification Center and POSTs this device's subscription on mount, and § 5.2.'s proxy proves only that a cookie exists — mounted above this layout's own check it would clear a revoked user's banners and spend a 401 on the way to `/login`. */}
        <PushSync />
      </ProfileViewerProvider>
    </ChatStreamProvider>
  );
}
