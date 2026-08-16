"use client";

import type { ShellSnapshot } from "@/features/offline-snapshot";
import { APP_SHELL_ID } from "@/shared/config";
import { cn, useHydrated, type Optional } from "@/shared/lib";
import { OfflineNotice } from "@/shared/offline-ux";
import { useSnapshot } from "@/shared/snapshot";
import { BottomOverlay, Container } from "@/shared/ui";
import { OfflineBanner } from "@/widgets/offline-banner";
import {
  OfflineTabBar,
  SnapshotEmpty,
  toMirrorScreen,
  type MirrorScreen,
} from "@/widgets/offline-shell";
import { MessageCircle } from "lucide-react";
import { useReloadWhenReachable } from "../model/use-reload-when-reachable";
import { MirrorArchive } from "./mirror-archive";
import { MirrorCalendar } from "./mirror-calendar";
import { MirrorChat } from "./mirror-chat";
import { MirrorLoading } from "./mirror-loading";
import { MirrorNotice } from "./mirror-notice";
import { MirrorSettings } from "./mirror-settings";

export type OfflineMirrorPageProps = {
  className?: string;
};

/**
 * The one cached document the service worker answers every failed navigation with
 * (REQUIREMENTS.md § 16.).
 *
 * WARN: It is prerendered for its own path and served at whichever one the reader
 * asked for, so **nothing here may render from the URL until hydration is over** —
 * the first client render has to be the same neutral shell the server produced, or
 * every screen mismatches. `useHydrated` is that gate, and it is the same one
 * `blur-placeholder` uses for the same reason.
 *
 * WARN: No user data may be baked into this document (§ 16.). Every screen below
 * reads its own snapshot out of IndexedDB, which is keyed by user and cleared on
 * logout, where `caches` is shared by every account that has used the browser.
 */
export function OfflineMirrorPage({ className }: OfflineMirrorPageProps) {
  const isHydrated = useHydrated();
  const screen = isHydrated ? toMirrorScreen(window.location.pathname) : undefined;
  const shell = useSnapshot<ShellSnapshot>("shell");

  // INFO: REQUIREMENTS.md § 16.2. The reader is on a frozen copy of a screen that works again the moment the network does, and nothing on it would say so — the pill leaving is the only signal, and it says the opposite of what the screen is.
  useReloadWhenReachable();

  return (
    <Container
      className={cn("relative flex min-h-dvh flex-col bg-canvas px-0 shell-edge", className)}
      id={APP_SHELL_ID}
    >
      {/* WARN: DESIGN.md § 7.18. The pill shows on every screen, and these six are the only ones that exist *while* offline — without it the mirror is the one place the reader is shown stale content and told nothing about why, and its `role="status"` is the only announcement a screen reader gets here. */}
      <OfflineBanner />
      <main className="flex flex-1 flex-col">{renderScreen(screen)}</main>
      <BottomOverlay>
        <OfflineTabBar screen={screen} />
      </BottomOverlay>
      {/* INFO: Mounted here because the mirror is outside the `(main)` shell that carries it for every other screen — a refusing control's `aria-describedby` has to resolve somewhere. */}
      <OfflineNotice />
    </Container>
  );

  function renderScreen(current: Optional<MirrorScreen>) {
    if (!isHydrated || shell.status === "loading") {
      return <MirrorLoading />;
    }

    // INFO: A path with no mirror. The worker answers those with `OFFLINE_ROUTE` instead, so this is only reached if that routing and this resolver ever disagree.
    if (current === undefined) {
      return <MirrorNotice />;
    }

    if (current === "calendar") {
      return <MirrorCalendar />;
    }
    if (current === "gallery" || current === "files" || current === "voice") {
      return <MirrorArchive shelf={current} />;
    }

    // WARN: 채팅 and 설정 both resolve people — the sender of every bubble, and whose profile this is — so neither can be drawn from its own snapshot alone.
    // INFO: A first launch that has never been online reads as a miss rather than a fault: nothing was stored because nothing was ever received, which is what the two branches below say instead of reporting an error.
    if (shell.status !== "hit") {
      return current === "chat" ? (
        <SnapshotEmpty Icon={MessageCircle} subject="메시지" />
      ) : (
        <MirrorNotice />
      );
    }

    return current === "chat" ? (
      <MirrorChat shell={shell.payload} />
    ) : (
      <MirrorSettings shell={shell.payload} />
    );
  }
}
